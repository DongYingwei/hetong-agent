/**
 * T06 —— assertReadOnly 只读防线单测（无需数据库）。
 *
 * 验收（工单 §验收标准）：
 *   · INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/GRANT 全被拒
 *   · 多语句、注释注入被拒/失效
 *   · 多表 JOIN 的单条 SELECT 被放行（模块查询靠 JOIN contract_module_hits，不能误杀）
 */

import { describe, it, expect } from "vitest";
import { assertReadOnly, NotReadOnlyError } from "../src/assertReadOnly.js";

describe("assertReadOnly —— 放行单条只读 SELECT", () => {
  it("放行普通 SELECT", () => {
    expect(assertReadOnly("SELECT contract_no FROM contracts WHERE sign_year = 2026"))
      .toContain("SELECT");
  });

  it("放行多表 JOIN 的单条 SELECT（模块过滤，不能误杀）", () => {
    const sql =
      "SELECT c.contract_no, c.contract_name FROM contracts c " +
      "JOIN contract_module_hits h ON h.contract_id = c.id " +
      "WHERE h.module_key = 'service' AND h.hit = 1";
    expect(() => assertReadOnly(sql)).not.toThrow();
  });

  it("放行含聚合/分组的单条 SELECT（金额分口径求和）", () => {
    const sql =
      "SELECT amount_type, SUM(amount) FROM contracts " +
      "WHERE amount IS NOT NULL GROUP BY amount_type";
    expect(() => assertReadOnly(sql)).not.toThrow();
  });

  it("放行 EXISTS/NOT EXISTS 子查询（一命中一未命中）", () => {
    const sql =
      "SELECT c.contract_no FROM contracts c WHERE " +
      "EXISTS (SELECT 1 FROM contract_module_hits h WHERE h.contract_id=c.id AND h.module_key='service' AND h.hit=1) " +
      "AND NOT EXISTS (SELECT 1 FROM contract_module_hits h WHERE h.contract_id=c.id AND h.module_key='tech' AND h.hit=1)";
    expect(() => assertReadOnly(sql)).not.toThrow();
  });

  it("返回 trim 后的 SQL 原文", () => {
    expect(assertReadOnly("  SELECT 1  ")).toBe("SELECT 1");
  });
});

describe("assertReadOnly —— 拒绝写操作", () => {
  const writes: [string, string][] = [
    ["INSERT", "INSERT INTO contracts (contract_no) VALUES ('x')"],
    ["UPDATE", "UPDATE contracts SET amount = 0 WHERE id = 1"],
    ["DELETE", "DELETE FROM contracts WHERE id = 1"],
    ["DROP", "DROP TABLE contracts"],
    ["ALTER", "ALTER TABLE contracts ADD COLUMN x INT"],
    ["TRUNCATE", "TRUNCATE TABLE contracts"],
    ["CREATE", "CREATE TABLE evil (id INT)"],
    ["GRANT", "GRANT ALL ON contracts TO public"],
  ];

  for (const [label, sql] of writes) {
    it(`拒绝 ${label}`, () => {
      expect(() => assertReadOnly(sql)).toThrow(NotReadOnlyError);
    });
  }
});

describe("assertReadOnly —— 拒绝多语句 / 注入", () => {
  it("拒绝多语句（SELECT; DROP）", () => {
    expect(() => assertReadOnly("SELECT 1; DROP TABLE contracts")).toThrow(NotReadOnlyError);
  });

  it("拒绝多语句（两条 SELECT 也拒）", () => {
    expect(() => assertReadOnly("SELECT 1; SELECT 2")).toThrow(NotReadOnlyError);
  });

  it("注释注入的写操作失效（-- ; DROP 被剥离，仅剩只读 SELECT）", () => {
    // 注释后的 DROP 不进 AST → 放行的是纯 SELECT，注入无害。
    const sql = "SELECT contract_no FROM contracts -- ; DROP TABLE contracts";
    expect(() => assertReadOnly(sql)).not.toThrow();
  });

  it("拒绝空 SQL", () => {
    expect(() => assertReadOnly("   ")).toThrow(NotReadOnlyError);
  });

  it("拒绝无法解析的乱码", () => {
    expect(() => assertReadOnly("NOT A VALID SQL @@@")).toThrow(NotReadOnlyError);
  });
});
