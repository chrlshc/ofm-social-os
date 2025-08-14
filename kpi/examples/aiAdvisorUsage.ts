import { AnalyticsEngine, AnalyticsEngineFactory } from '../models/AnalyticsEngine';
import { ETLProcessor } from '../models/ETLProcessor';
import { generateRecommendations, KPIContext } from '../advisors/AIAdvisor';
import { BenchmarkAnalyzer } from '../utils/benchmarkUtils';
import { KpiRecord } from '../models/BaseModel';

async function demonstrateAIAdvisorIntegration() {
  console.log('🧠 Démonstration du système AI Advisor intégré\n');

  const etlProcessor = new ETLProcessor();
  const analytics = AnalyticsEngineFactory.createMarketingAnalytics(etlProcessor);
  const benchmarkAnalyzer = new BenchmarkAnalyzer();

  const mockKpiData: KpiRecord[] = [
    {
      id: '1',
      modelName: 'model_sarah_2024',
      metricName: 'ctr',
      value: 1.2,
      platform: 'instagram',
      campaignId: 'camp_001',
      createdAt: new Date('2024-01-15T10:00:00Z')
    },
    {
      id: '2',
      modelName: 'model_sarah_2024',
      metricName: 'cpl',
      value: 8.5,
      platform: 'instagram',
      campaignId: 'camp_001',
      createdAt: new Date('2024-01-15T11:00:00Z')
    },
    {
      id: '3',
      modelName: 'model_sarah_2024',
      metricName: 'engagement_rate',
      value: 2.8,
      platform: 'instagram',
      campaignId: 'camp_001',
      createdAt: new Date('2024-01-15T12:00:00Z')
    },
    {
      id: '4',
      modelName: 'model_sarah_2024',
      metricName: 'ctr',
      value: 0.9,
      platform: 'instagram',
      campaignId: 'camp_002',
      createdAt: new Date('2024-01-16T10:00:00Z')
    },
    {
      id: '5',
      modelName: 'model_sarah_2024',
      metricName: 'cpl',
      value: 12.2,
      platform: 'instagram',
      campaignId: 'camp_002',
      createdAt: new Date('2024-01-16T11:00:00Z')
    }
  ];

  console.log('📊 1. Analyse complète avec AI Advisor intégré');
  try {
    const analysisResults = await analytics.runAnalysis();
    
    console.log('\n✅ Insights générés:');
    analysisResults.insights.forEach((insight, index) => {
      console.log(`   ${index + 1}. ${insight.insight}`);
      if (insight.category) {
        console.log(`      📂 Catégorie: ${insight.category}`);
      }
    });

    console.log('\n🎯 Recommandations:');
    analysisResults.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. [${rec.priority}] ${rec.recommendation}`);
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse:', error);
  }

  console.log('\n📈 2. Utilisation directe de l\'AI Advisor');
  
  const kpiContext: KPIContext = {
    modelName: 'model_sarah_2024',
    aggregatedMetrics: {
      ctr: 1.05,
      cpl: 10.35,
      engagement_rate: 2.8
    },
    trends: {
      ctr: 'downward',
      cpl: 'upward',
      engagement_rate: 'stable'
    },
    benchmarks: {
      ctr: { rank: 3, score: 65 },
      cpl: { rank: 4, score: 45 },
      engagement_rate: { rank: 2, score: 78 }
    },
    anomalies: [
      'CPL anormalement élevé détecté le 16/01 (12.2€ vs 6.8€ moyenne)',
      'CTR en baisse constante sur 48h'
    ]
  };

  try {
    const directRecommendations = await generateRecommendations(kpiContext, {
      maxTokens: 400,
      temperature: 0.3,
      includeActionItems: true,
      priorityLevel: 'high'
    });

    console.log('\n🤖 Recommandations AI directes:');
    directRecommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec.insight}`);
      if (rec.priority) {
        console.log(`      ⚡ Priorité: ${rec.priority}`);
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la génération de recommandations:', error);
  }

  console.log('\n📊 3. Analyse comparative avec benchmarks');
  
  try {
    const benchmarks = await benchmarkAnalyzer.computeModelBenchmarks(
      'model_sarah_2024', 
      mockKpiData
    );

    console.log('\n🏆 Position concurrentielle:');
    Object.entries(benchmarks).forEach(([metric, data]) => {
      const emoji = data.rank <= 2 ? '🥇' : data.rank <= 3 ? '🥈' : '📉';
      console.log(`   ${emoji} ${metric}: Rang ${data.rank}, Score ${data.score}/100`);
    });

    const trendAnalysis = await benchmarkAnalyzer.detectTrendDirection(
      'model_sarah_2024',
      'ctr',
      mockKpiData.filter(r => r.metricName === 'ctr')
    );

    console.log('\n📈 Analyse de tendance CTR:');
    console.log(`   📊 Direction: ${trendAnalysis.direction}`);
    console.log(`   💪 Force: ${(trendAnalysis.strength * 100).toFixed(1)}%`);
    console.log(`   🎯 Confiance: ${(trendAnalysis.confidence * 100).toFixed(1)}%`);
    console.log(`   ⏱️  Période: ${trendAnalysis.timeframe}`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse benchmark:', error);
  }

  console.log('\n🎯 4. Scénario de recommandations contextuelles');
  
  const scenarioContext: KPIContext = {
    modelName: 'model_sarah_2024',
    aggregatedMetrics: {
      ctr: 0.8,
      cpl: 15.2,
      conversion_rate: 1.2,
      engagement_rate: 1.9
    },
    trends: {
      ctr: 'downward',
      cpl: 'upward',
      conversion_rate: 'downward',
      engagement_rate: 'stable'
    },
    benchmarks: {
      ctr: { rank: 5, score: 32 },
      cpl: { rank: 5, score: 25 },
      conversion_rate: { rank: 4, score: 38 },
      engagement_rate: { rank: 3, score: 58 }
    },
    anomalies: [
      'Chute brutale du CTR de 2.1% à 0.8% en 24h',
      'CPL au-dessus du seuil critique (15.2€ vs 8€ cible)',
      'Taux de conversion divisé par 3 depuis hier'
    ]
  };

  try {
    const urgentRecommendations = await generateRecommendations(scenarioContext, {
      priorityLevel: 'high',
      includeActionItems: true,
      maxTokens: 500
    });

    console.log('\n🚨 Recommandations d\'urgence:');
    urgentRecommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. 🔥 ${rec.insight}`);
    });

  } catch (error) {
    console.error('❌ Erreur lors des recommandations d\'urgence:', error);
  }

  console.log('\n✅ Démonstration terminée - Le système AI Advisor est opérationnel!');
}

export { demonstrateAIAdvisorIntegration };

if (require.main === module) {
  demonstrateAIAdvisorIntegration().catch(console.error);
}