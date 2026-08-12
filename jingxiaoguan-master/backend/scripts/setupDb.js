import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setup() {
  console.log('📦 开始连接 MySQL 数据库...');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'zc18243933',
    multipleStatements: true,
  });

  try {
    const sqlPath = path.join(__dirname, 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🚀 执行数据库初始化脚本 init.sql ...');
    await connection.query(sql);
    console.log('✅ 数据库 contract_assistant 及初始数据搭建完成！');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

setup();
