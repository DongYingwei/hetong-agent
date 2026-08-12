/**
 * assertReadOnly —— sql_query 的第一道只读防线（坑3）。
 *
 * 用 AST 真解析（node-sql-parser，PostgreSQL 方言），不手写正则（工单 T06 硬要求）：
 *   · 必须能解析成【单条】语句（多语句 → parser 返数组 → 拒）。
 *   · 该语句类型必须是 SELECT（INSERT/UPDATE/DELETE/DROP/ALTER/... → type≠'select' → 拒）。
 *   · 允许多表 JOIN 的单条 SELECT（模块过滤靠 JOIN contract_module_hits，不能误杀）。
 *
 * 注释注入（`-- ; DROP ...`）：parser 会剥离注释，注入的写操作不进 AST，天然失效。
 * 这是三道只读防线的第①道；②LIMIT+超时在 sql_query 内、③PG 只读角色在部署（G1）。
 */

import pkg from "node-sql-parser";

const { Parser } = pkg;
const parser = new Parser();
const PARSE_OPT = { database: "postgresql" } as const;

export class NotReadOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotReadOnlyError";
  }
}

/**
 * 校验一段 SQL 是否为「单条只读 SELECT」。不是则抛 NotReadOnlyError。
 * 返回被确认放行的（trim 后）SQL 原文，供调用方执行。
 */
export function assertReadOnly(sql: string): string {
  const trimmed = (sql ?? "").trim();
  if (!trimmed) {
    throw new NotReadOnlyError("SQL 为空");
  }

  let ast: unknown;
  try {
    ast = parser.astify(trimmed, PARSE_OPT);
  } catch (e) {
    // 语法无法解析 → 不放行（无法证明其只读）。
    throw new NotReadOnlyError(`SQL 无法解析，拒绝执行：${(e as Error).message}`);
  }

  // 多语句：node-sql-parser 对多条语句返回数组。单条只读绝不允许多语句。
  if (Array.isArray(ast)) {
    throw new NotReadOnlyError("仅允许单条 SELECT，检测到多条语句");
  }

  const stmt = ast as { type?: string };
  if (stmt.type !== "select") {
    throw new NotReadOnlyError(`仅允许 SELECT，检测到语句类型：${stmt.type ?? "未知"}`);
  }

  return trimmed;
}
