import dotenv from 'dotenv';

dotenv.config();

/**
 * 全局应用配置中心
 */
export const config = {
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    env: process.env.NODE_ENV || 'development',
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'zc18243933',
    database: process.env.DB_NAME || 'contract_assistant',
    connectionLimit: 10,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'contract_assistant_secret_2026_key',
    expiresIn: '24h',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  },
};