import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger';

// Database connection string from environment
const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/ofm_marketing';

// Create Sequelize instance
export const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: (msg) => logger.debug(msg),
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: false,
  },
});

// Test connection
export async function testConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
    logger.info('Database connection has been established successfully.');
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    throw error;
  }
}

// Export models after they're initialized
export * from '../models/ContentPlan';
export * from '../models/TopProfile';