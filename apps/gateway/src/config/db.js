import pg from 'pg';
import { config } from './index.js';

/**
 * PostgreSQL 连接池（T10：MySQL→PG 迁移，坑1/坑6 全系统统一 PG）。
 *
 * 兼容层：保留原 mysql2 的 query(sql, params) 接口签名，
 * 让绝大多数路由零改动即可迁移——差异在 SQL 方言层由本文件吸收：
 *   · 占位符 `?` → `$1,$2,...`（PG 用带序号占位符）
 *   · 反引号 `col` → 去除（PG 用双引号或裸标识符）
 * 只有用到 insertId 的写入需改 SQL 带 RETURNING id（见 query 返回的 insertId 兼容字段）。
 */
export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.connectionLimit,
});

/** MySQL 方言 → PG：`?` 顺序占位符转 $n，去反引号。 */
function toPg(sql) {
  let i = 0;
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  return converted.replace(/`/g, '');
}

/**
 * 通用查询：返回**行数组**（与原 mysql2 封装一致，路由无需改读取方式）。
 * 若语句含 RETURNING id，可从 rows[0].id 取新主键（替代 mysql2 的 insertId）。
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array>}
 */
export async function query(sql, params = []) {
  const res = await pool.query(toPg(sql), params);
  return res.rows;
}

/**
 * 查询库只读连接池（解析写入的 contracts 库，网关只读消费）。
 * 台账页/合同详情走这里；用只读角色 jinguan_readonly，物理上防误写（三道防线第③道）。
 */
export const queryPool = new pg.Pool({
  connectionString: config.queryDb.url,
  max: config.queryDb.connectionLimit,
});

/** 只读查询查询库 contracts。SQL 用 $n 占位（PG 原生，不做 ? 转换）。 */
export async function queryRead(sql, params = []) {
  const res = await queryPool.query(sql, params);
  return res.rows;
}
