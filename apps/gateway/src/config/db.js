import pg from 'pg';
import { config } from './index.js';

/**
 * PostgreSQL 连接池（T10：MySQL→PG 迁移，坑1/坑6 全系统统一 PG）。
 *
 * 兼容层：保留原 mysql2 的 query(sql, params)/withTransaction 接口签名，
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
 * 事务封装：回调收到一个 mysql2 兼容的连接对象，暴露 execute(sql, params)
 * 返回 [rowsOrMeta]，其中写入语句可通过 rows[0]/meta.insertId 取新 id。
 * @param {Function} callback async (conn) => result
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    // mysql2 兼容 shim：execute 返回 [result]，result 带 insertId/rows/rowCount。
    const conn = {
      async execute(sql, params = []) {
        const res = await client.query(toPg(sql), params);
        const insertId = res.rows && res.rows[0] ? res.rows[0].id : undefined;
        const result = { insertId, affectedRows: res.rowCount, rows: res.rows };
        return [result];
      },
      async query(sql, params = []) {
        const res = await client.query(toPg(sql), params);
        return [res.rows];
      },
    };
    const result = await callback(conn);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
