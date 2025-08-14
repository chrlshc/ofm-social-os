import axios from 'axios';

const KPI_API_URL = process.env.KPI_API_URL || 'http://localhost:3000/api/kpi';

interface PaymentMetric {
  modelName: string;
  metricName: string;
  value: number;
  metadata?: Record<string, any>;
}

class PaymentKpiTracker {
  private metricsQueue: PaymentMetric[] = [];
  private flushInterval: NodeJS.Timeout;
  
  constructor() {
    // Flush des métriques toutes les 30 secondes
    this.flushInterval = setInterval(() => this.flushMetrics(), 30000);
  }
  
  async trackTransaction(data: {
    transactionId: string;
    userId: string;
    amount: number;
    currency: string;
    status: 'success' | 'failed' | 'pending';
    paymentMethod: string;
    planType?: string;
    metadata?: Record<string, any>;
  }) {
    // Tracker le revenu
    if (data.status === 'success') {
      this.queueMetric({
        modelName: 'payment',
        metricName: 'transaction_amount',
        value: data.amount,
        metadata: {
          currency: data.currency,
          paymentMethod: data.paymentMethod,
          planType: data.planType,
          ...data.metadata
        }
      });
      
      this.queueMetric({
        modelName: 'payment',
        metricName: 'successful_transactions',
        value: 1,
        metadata: {
          paymentMethod: data.paymentMethod,
          planType: data.planType
        }
      });
    } else if (data.status === 'failed') {
      this.queueMetric({
        modelName: 'payment',
        metricName: 'failed_transactions',
        value: 1,
        metadata: {
          paymentMethod: data.paymentMethod,
          reason: data.metadata?.failureReason
        }
      });
    }
    
    // Calculer le taux de transaction échouée
    await this.calculateTransactionSuccessRate();
  }
  
  async trackSubscription(data: {
    userId: string;
    action: 'created' | 'upgraded' | 'downgraded' | 'cancelled' | 'renewed';
    planType: string;
    monthlyValue: number;
    currency: string;
    metadata?: Record<string, any>;
  }) {
    switch (data.action) {
      case 'created':
        this.queueMetric({
          modelName: 'payment',
          metricName: 'new_subscriptions',
          value: 1,
          metadata: { planType: data.planType }
        });
        
        this.queueMetric({
          modelName: 'payment',
          metricName: 'mrr_added',
          value: data.monthlyValue,
          metadata: { planType: data.planType, currency: data.currency }
        });
        break;
        
      case 'cancelled':
        this.queueMetric({
          modelName: 'payment',
          metricName: 'cancellations',
          value: 1,
          metadata: { 
            planType: data.planType,
            reason: data.metadata?.cancellationReason 
          }
        });
        
        this.queueMetric({
          modelName: 'payment',
          metricName: 'mrr_lost',
          value: data.monthlyValue,
          metadata: { planType: data.planType, currency: data.currency }
        });
        break;
        
      case 'upgraded':
        const mrrIncrease = data.monthlyValue - (data.metadata?.previousValue || 0);
        this.queueMetric({
          modelName: 'payment',
          metricName: 'mrr_expansion',
          value: mrrIncrease,
          metadata: { planType: data.planType }
        });
        break;
        
      case 'downgraded':
        const mrrDecrease = (data.metadata?.previousValue || 0) - data.monthlyValue;
        this.queueMetric({
          modelName: 'payment',
          metricName: 'mrr_contraction',
          value: mrrDecrease,
          metadata: { planType: data.planType }
        });
        break;
    }
    
    // Calculer le churn rate
    await this.calculateChurnRate();
  }
  
  async trackTrialConversion(data: {
    userId: string;
    converted: boolean;
    trialDuration: number;
    planType?: string;
  }) {
    this.queueMetric({
      modelName: 'payment',
      metricName: converted ? 'trial_conversions' : 'trial_abandonments',
      value: 1,
      metadata: {
        trialDuration: data.trialDuration,
        planType: data.planType
      }
    });
    
    // Calculer le taux de conversion des essais
    await this.calculateTrialConversionRate();
  }
  
  async trackRefund(data: {
    transactionId: string;
    amount: number;
    reason: string;
    daysSincePurchase: number;
  }) {
    this.queueMetric({
      modelName: 'payment',
      metricName: 'refunds',
      value: 1,
      metadata: {
        reason: data.reason,
        daysSincePurchase: data.daysSincePurchase
      }
    });
    
    this.queueMetric({
      modelName: 'payment',
      metricName: 'refund_amount',
      value: data.amount,
      metadata: { reason: data.reason }
    });
  }
  
  private queueMetric(metric: PaymentMetric) {
    this.metricsQueue.push(metric);
    
    // Flush si la queue est trop grande
    if (this.metricsQueue.length >= 100) {
      this.flushMetrics();
    }
  }
  
  private async flushMetrics() {
    if (this.metricsQueue.length === 0) return;
    
    const metrics = [...this.metricsQueue];
    this.metricsQueue = [];
    
    try {
      await axios.post(`${KPI_API_URL}/ingest/batch`, metrics);
      console.log(`Flushed ${metrics.length} payment metrics`);
    } catch (error) {
      console.error('Failed to flush payment metrics:', error);
      // Remettre les métriques dans la queue
      this.metricsQueue.unshift(...metrics);
    }
  }
  
  private async calculateTransactionSuccessRate() {
    // Cette fonction devrait calculer le taux de succès basé sur les données récentes
    // Implémentation simplifiée ici
    const successRate = 95; // Placeholder
    
    this.queueMetric({
      modelName: 'payment',
      metricName: 'transaction_success_rate',
      value: successRate
    });
  }
  
  private async calculateChurnRate() {
    // Calculer le churn rate mensuel
    // Implémentation simplifiée
    const churnRate = 3.5; // Placeholder
    
    this.queueMetric({
      modelName: 'payment',
      metricName: 'churn_rate',
      value: churnRate
    });
  }
  
  private async calculateTrialConversionRate() {
    // Calculer le taux de conversion des essais
    // Implémentation simplifiée
    const conversionRate = 25; // Placeholder
    
    this.queueMetric({
      modelName: 'payment',
      metricName: 'trial_conversion_rate',
      value: conversionRate
    });
  }
  
  // Métriques agrégées quotidiennes
  async calculateDailyMetrics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculer le revenu quotidien
    const dailyRevenue = await this.getDailyRevenue(today);
    
    this.queueMetric({
      modelName: 'payment',
      metricName: 'daily_revenue',
      value: dailyRevenue,
      metadata: { date: today.toISOString() }
    });
    
    // Calculer l'ARPU (Average Revenue Per User)
    const activeUsers = await this.getActiveUserCount();
    if (activeUsers > 0) {
      const arpu = dailyRevenue / activeUsers;
      
      this.queueMetric({
        modelName: 'payment',
        metricName: 'arpu',
        value: arpu,
        metadata: { date: today.toISOString() }
      });
    }
    
    // Calculer le LTV (Lifetime Value)
    const avgCustomerLifetime = 12; // mois
    const monthlyChurnRate = 0.035; // 3.5%
    const avgMonthlyRevenue = dailyRevenue * 30;
    const ltv = avgMonthlyRevenue / monthlyChurnRate;
    
    this.queueMetric({
      modelName: 'payment',
      metricName: 'ltv',
      value: ltv,
      metadata: { 
        avgCustomerLifetime,
        monthlyChurnRate 
      }
    });
  }
  
  private async getDailyRevenue(date: Date): Promise<number> {
    // Implémenter la logique pour récupérer le revenu quotidien
    return 5000; // Placeholder
  }
  
  private async getActiveUserCount(): Promise<number> {
    // Implémenter la logique pour compter les utilisateurs actifs
    return 1000; // Placeholder
  }
  
  destroy() {
    clearInterval(this.flushInterval);
    this.flushMetrics();
  }
}

export const paymentTracker = new PaymentKpiTracker();

// Fonctions helper pour l'intégration
export const trackPaymentTransaction = paymentTracker.trackTransaction.bind(paymentTracker);
export const trackSubscriptionEvent = paymentTracker.trackSubscription.bind(paymentTracker);
export const trackTrialConversion = paymentTracker.trackTrialConversion.bind(paymentTracker);
export const trackRefund = paymentTracker.trackRefund.bind(paymentTracker);

// Middleware pour tracker les webhooks de paiement
export function paymentWebhookMiddleware(req: any, res: any, next: any) {
  const webhookType = req.headers['x-webhook-type'];
  
  if (webhookType) {
    paymentTracker.queueMetric({
      modelName: 'payment',
      metricName: 'webhook_received',
      value: 1,
      metadata: {
        type: webhookType,
        provider: req.headers['x-payment-provider']
      }
    });
  }
  
  next();
}

// Calculer les métriques quotidiennes
setInterval(() => {
  paymentTracker.calculateDailyMetrics();
}, 24 * 60 * 60 * 1000);

// Nettoyer à la fermeture
process.on('SIGINT', () => {
  paymentTracker.destroy();
  process.exit();
});