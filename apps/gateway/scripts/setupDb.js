import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 运营库初始化（T10：PostgreSQL）。
 * 先确保目标库存在，再执行 init_pg.sql 建表 + 种子。
 */
async function setup() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const database = process.env.DB_NAME || 'contract_assistant';

  console.log('📦 连接 PostgreSQL，确保目标库存在...');
  const admin = new pg.Client({ host, port, user, password, database: 'postgres' });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${database}`);
      console.log(`✅ 已创建数据库 ${database}`);
    }
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ host, port, user, password, database });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'init_pg.sql'), 'utf8');
    console.log('🚀 执行 init_pg.sql（建表 + 种子）...');
    await client.query(sql);
    console.log(`✅ 运营库 ${database} 及初始数据搭建完成！`);
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setup();
