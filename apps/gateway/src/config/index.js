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
    // 运营库（基础设施：用户/字典/文件/权限/关键词/模块）。合同台账已退役，改读查询库。
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'contract_assistant',
    connectionLimit: 10,
  },
  // 查询库（解析写入、只读消费）——台账页/合同详情读它，用只读角色 jinguan_readonly。
  // 优先用 PG_READONLY_URL 连接串；缺省时按运营库同主机 + contracts 库拼默认只读串。
  queryDb: {
    url:
      process.env.PG_READONLY_URL ||
      `postgresql://jinguan_readonly:ro_pw_2026@${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || '5432'}/contracts`,
    connectionLimit: 5,
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
    // 比 CoreMind 自身 110s 的运行预算多留 10s，使其能返回可读的执行失败信息。
    timeoutMs: parseInt(process.env.COREMIND_TIMEOUT_MS || '120000', 10),
  },
  // 解析侧 FastAPI（PDF→抽取→草稿→核对→入库+建向量）。前端上传/核对经网关代理到它。
  // 解析同步等待，超时给足（大 PDF 的 MinerU 解析可能数分钟）。
  parse: {
    url: process.env.PARSE_URL || 'http://127.0.0.1:8100',
    timeoutMs: parseInt(process.env.PARSE_TIMEOUT_MS || '600000', 10),
  },
};
