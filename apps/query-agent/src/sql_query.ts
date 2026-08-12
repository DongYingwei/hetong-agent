/**
 * sql_query —— 只读结构化查询工具（Text-to-SQL，ADR-0001）。
 *
 * 入参 = 模型生成的【裸 SELECT】（不是结构化过滤条件）。表结构/口径由注入的
 * jinguan-schema skill 声明，Agent 依列语义自行推理生成 SQL（ADR-0002）。
 *
 * 三道只读防线（坑3）：
 *   ① assertReadOnly：AST 真解析，仅单条 SELECT，拒写/多语句/注释注入。
 *   ② LIMIT + 语句超时：结果行数封顶 + statement_timeout，防跑飞。
 *   ③ PG 只读角色：连接串用只读账号（部署前置 G1），最后一道兜底。
 *
 * 金额/时间口径不在本工具强制，而由 schema skill + systemPrompt 引导模型写对
 * （SUM 带 IS NOT NULL、混口径分组、tax_rate 不算数、物化时间列语义）。
 * 自纠错（报错重写≤2、空结果只提示）由 CoreMind ReAct + systemPrompt 驱动：
 * 本工具把 DB 报错原文如实回灌，供模型据错改写重试。
 */

import pg from "pg";
import { assertReadOnly, NotReadOnlyError } from "./assertReadOnly.js";

const ROW_LIMIT = 500; // 防线②：单次结果行数封顶
const STATEMENT_TIMEOUT_MS = 8000; // 防线②：单条语句超时

interface SqlQueryParams {
  /** 模型生成的单条只读 SELECT（可含多表 JOIN，如 JOIN contract_module_hits）。 */
  sql: string;
  /**
   * 联动路径（T07）：由 vector_search 返回的合同 id 列表。传入时把结果限定在这些 id。
   * 本工具不改写模型 SQL 的语义，仅在最外层附加 id 约束（见 execute）。
   */
  contract_ids?: number[];
}

// 只读连接池（惰性建，复用）。连接串走只读账号（G1）。
let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (pool) return pool;
  const conn = process.env.PG_READONLY_URL;
  if (!conn) {
    throw new Error(
      "缺少只读数据库连接串（环境变量 PG_READONLY_URL 未设置）。这是三道只读防线的第③道（G1），部署前必须配置只读角色连接串。",
    );
  }
  pool = new pg.Pool({ connectionString: conn, max: 4 });
  return pool;
}

/** 防线②：把已确认只读的 SELECT 外包一层 LIMIT，行数封顶且不改内层语义。 */
function capRows(readonlySql: string): string {
  return `SELECT * FROM (${readonlySql}) AS _capped LIMIT ${ROW_LIMIT}`;
}

export default {
  name: "sql_query",
  description:
    "对合同结构化库执行【只读 SELECT】。你直接生成单条 PostgreSQL SELECT 语句传入 sql 参数" +
    "（可含多表 JOIN，模块过滤须 JOIN contract_module_hits）。严格依据 jinguan-schema 数据字典的列语义，" +
    "不得臆造列名。金额求和须带 amount IS NOT NULL；混口径按 amount_type 分组求和。" +
    "可选 contract_ids：把结果限定在指定合同集合（向量→SQL 联动时用）。",
  parameters: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description:
          "单条 PostgreSQL 只读 SELECT 语句。禁止 INSERT/UPDATE/DELETE/DROP 等写操作与多语句。",
      },
      contract_ids: {
        type: "array",
        items: { type: "number" },
        description: "可选：向量检索返回的合同 id 列表，用于二次统计。",
      },
    },
    required: ["sql"],
    additionalProperties: false,
  },
  execute: async (_toolCallId: string, params: SqlQueryParams) => {
    // 防线①：AST 真解析，仅单条 SELECT。
    let readonlySql: string;
    try {
      readonlySql = assertReadOnly(params.sql);
    } catch (e) {
      if (e instanceof NotReadOnlyError) {
        return {
          content: [{ type: "text", text: `SQL 被只读防线拒绝：${e.message}` }],
          details: { error: "not_read_only", message: e.message },
        };
      }
      throw e;
    }

    // 联动路径：把结果限定在 vector_search 给的 id 集合（外层约束，不动内层语义）。
    let effectiveSql = readonlySql;
    const params_values: unknown[] = [];
    if (params.contract_ids && params.contract_ids.length > 0) {
      // 内层 SELECT 须暴露 contract_id/id 才能过滤；这里在外层按 id 过滤子查询结果。
      effectiveSql = `SELECT * FROM (${readonlySql}) AS _sub WHERE _sub.id = ANY($1)`;
      params_values.push(params.contract_ids);
    }

    const finalSql = capRows(effectiveSql); // 防线②：行数封顶

    const client = await getPool().connect();
    try {
      // 防线②：语句超时（会话级，仅本连接）。
      await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const res = await client.query(finalSql, params_values);
      const result = { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
      };
    } catch (e) {
      // DB 报错原文如实回灌 → 供 Agent 据错重读 schema、改写重试（≤2，systemPrompt 驱动）。
      const message = (e as Error).message;
      return {
        content: [{ type: "text", text: `数据库执行出错：${message}` }],
        details: { error: "db_error", message },
      };
    } finally {
      client.release();
    }
  },
};
