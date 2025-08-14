import axios from 'axios';

const KPI_API_URL = process.env.KPI_API_URL || 'http://localhost:3000/api/kpi';

interface OnboardingEvent {
  userId: string;
  step: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

class OnboardingKpiTracker {
  private sessionData: Map<string, OnboardingEvent[]> = new Map();
  
  async trackUserEvent(event: OnboardingEvent) {
    // Stocker l'événement dans la session
    const userEvents = this.sessionData.get(event.userId) || [];
    userEvents.push(event);
    this.sessionData.set(event.userId, userEvents);
    
    // Ingérer immédiatement certaines métriques
    switch (event.step) {
      case 'signup_started':
        await this.ingestMetric({
          modelName: 'onboarding',
          metricName: 'signups_started',
          value: 1,
          metadata: { source: event.metadata?.source }
        });
        break;
        
      case 'signup_completed':
        await this.trackSignupCompletion(event);
        break;
        
      case 'onboarding_completed':
        await this.trackOnboardingCompletion(event);
        break;
        
      case 'step_abandoned':
        await this.trackAbandonment(event);
        break;
    }
  }
  
  private async trackSignupCompletion(event: OnboardingEvent) {
    const userEvents = this.sessionData.get(event.userId) || [];
    const signupStart = userEvents.find(e => e.step === 'signup_started');
    
    if (signupStart) {
      const duration = event.timestamp.getTime() - signupStart.timestamp.getTime();
      
      await Promise.all([
        this.ingestMetric({
          modelName: 'onboarding',
          metricName: 'signup_duration_ms',
          value: duration,
          metadata: { userId: event.userId }
        }),
        this.ingestMetric({
          modelName: 'onboarding',
          metricName: 'signups_completed',
          value: 1,
          metadata: { source: event.metadata?.source }
        })
      ]);
    }
  }
  
  private async trackOnboardingCompletion(event: OnboardingEvent) {
    const userEvents = this.sessionData.get(event.userId) || [];
    const signupComplete = userEvents.find(e => e.step === 'signup_completed');
    
    if (signupComplete) {
      const duration = event.timestamp.getTime() - signupComplete.timestamp.getTime();
      const steps = userEvents.filter(e => e.step.startsWith('step_')).length;
      
      await Promise.all([
        this.ingestMetric({
          modelName: 'onboarding',
          metricName: 'onboarding_duration_ms',
          value: duration,
          metadata: { userId: event.userId, steps }
        }),
        this.ingestMetric({
          modelName: 'onboarding',
          metricName: 'activation_rate',
          value: 100, // 100% pour ceux qui complètent
          metadata: { userId: event.userId }
        })
      ]);
      
      // Nettoyer les données de session
      this.sessionData.delete(event.userId);
    }
  }
  
  private async trackAbandonment(event: OnboardingEvent) {
    await this.ingestMetric({
      modelName: 'onboarding',
      metricName: 'drop_off_rate',
      value: 1,
      metadata: { 
        step: event.metadata?.abandonedStep,
        reason: event.metadata?.reason 
      }
    });
  }
  
  private async ingestMetric(metric: any) {
    try {
      await axios.post(`${KPI_API_URL}/ingest`, metric);
    } catch (error) {
      console.error('Failed to ingest onboarding metric:', error);
    }
  }
  
  // Métriques agrégées périodiques
  async calculateHourlyMetrics() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Calculer le taux de conversion global
    const started = await this.getMetricCount('signups_started', oneHourAgo, now);
    const completed = await this.getMetricCount('signups_completed', oneHourAgo, now);
    
    if (started > 0) {
      const conversionRate = (completed / started) * 100;
      
      await this.ingestMetric({
        modelName: 'onboarding',
        metricName: 'hourly_conversion_rate',
        value: conversionRate,
        metadata: { started, completed }
      });
    }
  }
  
  private async getMetricCount(metricName: string, startDate: Date, endDate: Date): Promise<number> {
    // Cette fonction devrait interroger votre base de données
    // Ici, c'est un placeholder
    return 0;
  }
}

export const onboardingTracker = new OnboardingKpiTracker();

// Hooks pour l'intégration avec votre système d'onboarding existant
export async function trackSignupStart(userId: string, source?: string) {
  await onboardingTracker.trackUserEvent({
    userId,
    step: 'signup_started',
    timestamp: new Date(),
    metadata: { source }
  });
}

export async function trackSignupComplete(userId: string, userData: any) {
  await onboardingTracker.trackUserEvent({
    userId,
    step: 'signup_completed',
    timestamp: new Date(),
    metadata: userData
  });
}

export async function trackOnboardingStep(userId: string, stepName: string, data?: any) {
  await onboardingTracker.trackUserEvent({
    userId,
    step: `step_${stepName}`,
    timestamp: new Date(),
    metadata: data
  });
}

export async function trackOnboardingComplete(userId: string) {
  await onboardingTracker.trackUserEvent({
    userId,
    step: 'onboarding_completed',
    timestamp: new Date()
  });
}

export async function trackAbandonment(userId: string, step: string, reason?: string) {
  await onboardingTracker.trackUserEvent({
    userId,
    step: 'step_abandoned',
    timestamp: new Date(),
    metadata: { abandonedStep: step, reason }
  });
}

// Middleware pour tracker les métriques d'acquisition
export function acquisitionTrackingMiddleware(req: any, res: any, next: any) {
  const source = req.query.utm_source || req.headers.referer || 'direct';
  
  // Tracker les visites
  onboardingTracker.ingestMetric({
    modelName: 'onboarding',
    metricName: 'page_views',
    value: 1,
    metadata: {
      path: req.path,
      source,
      utm_campaign: req.query.utm_campaign,
      utm_medium: req.query.utm_medium
    }
  });
  
  next();
}

// Calculer les métriques toutes les heures
setInterval(() => {
  onboardingTracker.calculateHourlyMetrics();
}, 60 * 60 * 1000);