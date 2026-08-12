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
    // T10：迁 PostgreSQL（默认端口 5432、默认用户 postgres）
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
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
  // T10：查询智能体走 CoreMind（不再用网关裸 generateText）。
  // COREMIND_URL 指向 CoreMind HTTP 服务的对话端点；缺省时 /agent/chat 返回 503。
  coremind: {
    url: process.env.COREMIND_URL || '',
    timeoutMs: parseInt(process.env.COREMIND_TIMEOUT_MS || '60000', 10),
  },
};