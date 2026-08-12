import mysql from 'mysql2/promise';
import { config } from './index.js';

/**
 * 创建 MySQL 数据库连接池
 */
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
});

/**
 * 封装通用 SQL 查询方法
 * @param {string} sql 运行的 SQL 语句
 * @param {Array} params 注入参数数组
 * @returns {Promise<Array>} 查询结果
 */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * 事务处理封装工具函数，确保多表操作数据一致性
 * @param {Function} callback 事务内部回调
 */
export async function withTransaction(callback) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
