import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Create a custom registry
const register = new Registry();

// Default metrics (CPU, memory, etc.)
const collectDefaultMetrics = require('prom-client').collectDefaultMetrics;
collectDefaultMetrics({ register });

// Custom metrics for marketing features
const scraperRunsTotal = new Counter({
  name: 'ofm_scraper_runs_total',
  help: 'Total number of scraper runs',
  registers: [register],
});

const scraperProfilesScraped = new Counter({
  name: 'ofm_scraper_profiles_scraped',
  help: 'Total number of profiles scraped',
  labelNames: ['platform'],
  registers: [register],
});

const scraperProfilesFailed = new Counter({
  name: 'ofm_scraper_profiles_failed',
  help: 'Total number of failed profile scrapes',
  labelNames: ['platform'],
  registers: [register],
});

const scraperDuration = new Histogram({
  name: 'ofm_scraper_duration_seconds',
  help: 'Duration of scraper runs in seconds',
  buckets: [10, 30, 60, 120, 300, 600],
  registers: [register],
});

const modelTrainingRuns = new Counter({
  name: 'ofm_model_training_runs_total',
  help: 'Total number of model training runs',
  registers: [register],
});

const modelTrainingFailures = new Counter({
  name: 'ofm_model_training_failures_total',
  help: 'Total number of failed model training runs',
  registers: [register],
});

const modelTrainingDuration = new Histogram({
  name: 'ofm_model_training_duration_seconds',
  help: 'Duration of model training in seconds',
  buckets: [10, 30, 60, 120, 300],
  registers: [register],
});

const modelClustersCount = new Gauge({
  name: 'ofm_model_clusters_count',
  help: 'Number of clusters in the trained model',
  registers: [register],
});

const modelProfilesCategorized = new Gauge({
  name: 'ofm_model_profiles_categorized',
  help: 'Number of profiles categorized by the model',
  registers: [register],
});

const contentPlansCreated = new Counter({
  name: 'ofm_content_plans_created',
  help: 'Total number of content plans created',
  labelNames: ['platform'],
  registers: [register],
});

const contentPostsScheduled = new Counter({
  name: 'ofm_content_posts_scheduled',
  help: 'Total number of posts scheduled',
  labelNames: ['platform', 'status'],
  registers: [register],
});

const temporalWorkflowsStarted = new Counter({
  name: 'ofm_temporal_workflows_started',
  help: 'Total number of Temporal workflows started',
  labelNames: ['workflow_type', 'status'],
  registers: [register],
});

// Export metrics interface
export const metrics = {
  register,
  
  increment(metric: string, value: number = 1, labels?: any) {
    switch (metric) {
      case 'scraper_runs_total':
        scraperRunsTotal.inc(value);
        break;
      case 'scraper_profiles_scraped':
        scraperProfilesScraped.inc(labels, value);
        break;
      case 'scraper_profiles_failed':
        scraperProfilesFailed.inc(labels, value);
        break;
      case 'model_training_runs_total':
        modelTrainingRuns.inc(value);
        break;
      case 'model_training_failures_total':
        modelTrainingFailures.inc(value);
        break;
      case 'content_plans_created':
        contentPlansCreated.inc(labels, value);
        break;
      case 'content_posts_scheduled':
        contentPostsScheduled.inc(labels, value);
        break;
      case 'temporal_workflows_started':
        temporalWorkflowsStarted.inc(labels, value);
        break;
    }
  },
  
  observe(metric: string, value: number, labels?: any) {
    switch (metric) {
      case 'scraper_duration_seconds':
        scraperDuration.observe(value);
        break;
      case 'model_training_duration_seconds':
        modelTrainingDuration.observe(value);
        break;
    }
  },
  
  gauge(metric: string, value: number, labels?: any) {
    switch (metric) {
      case 'model_clusters_count':
        modelClustersCount.set(value);
        break;
      case 'model_profiles_categorized':
        modelProfilesCategorized.set(value);
        break;
    }
  },
};

// Export for Express endpoint
export function getMetrics(): Promise<string> {
  return register.metrics();
}