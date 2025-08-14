import { db } from '../utils/db';

// Mock de la base de données pour les tests
jest.mock('../utils/db', () => ({
  db: {
    query: jest.fn(),
    transaction: jest.fn(),
    insertMetric: jest.fn(),
    insertInsight: jest.fn(),
    insertRecommendation: jest.fn()
  },
  AppDataSource: {
    initialize: jest.fn(),
    destroy: jest.fn(),
    isInitialized: false
  }
}));

// Mock des services externes
jest.mock('../utils/llm', () => ({
  callLLM: jest.fn().mockResolvedValue('Mock LLM response'),
  callLLMWithCache: jest.fn().mockResolvedValue('Mock cached LLM response'),
  generateEmbedding: jest.fn().mockResolvedValue(Array(1536).fill(0.1))
}));

jest.mock('../utils/notif', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  sendAlertEmail: jest.fn().mockResolvedValue(undefined),
  sendDailyReport: jest.fn().mockResolvedValue(undefined)
}));

// Configuration globale des variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'test_kpi';
process.env.LLM_PROVIDER = 'mock';

// Nettoyage après chaque test
afterEach(() => {
  jest.clearAllMocks();
});

// Timeout global pour les tests
jest.setTimeout(10000);