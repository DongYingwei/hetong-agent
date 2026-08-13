import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildFaithfulWorkbook, type ExportRow } from './excelExporter';

// 读回工作簿首个工作表的「数据行」(表头之后),用于按输出可观察行为断言。
function readDataRows(wb: ExcelJS.Workbook): Record<string, unknown>[] {
  const ws = wb.worksheets[0];
  const header = ws.getRow(1).values as unknown[]; // [ , col1, col2, ...]
  const rows: Record<string, unknown>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // 跳过表头
    const rec: Record<string, unknown> = {};
    (row.values as unknown[]).forEach((v, i) => {
      const key = header[i];
      if (typeof key === 'string') rec[key] = v;
    });
    rows.push(rec);
  });
  return rows;
}

describe('buildFaithfulWorkbook — 忠实导出检索结果', () => {
  it('行数守恒:输出数据行数 == 输入行数', () => {
    const rows: ExportRow[] = [
      { 合同号: 'HT-2026-001', 客户: '中国移动', 金额: 5800000 },
      { 合同号: 'HT-2026-002', 客户: '华为技术', 金额: 1200000 },
      { 合同号: 'HT-2026-003', 客户: '南京大学', 金额: 300000 },
    ];
    const wb = buildFaithfulWorkbook(rows);
    expect(readDataRows(wb)).toHaveLength(3);
  });

  it('数值忠实:每格值 == 输入原值,不再格式化、不合并', () => {
    const rows: ExportRow[] = [
      { 合同号: 'HT-2026-001', 金额: 5800000, 税率: '6%' },
    ];
    const wb = buildFaithfulWorkbook(rows);
    const [row] = readDataRows(wb);
    expect(row['合同号']).toBe('HT-2026-001');
    expect(row['金额']).toBe(5800000);   // 数字原样,未转字符串、未加千分位
    expect(row['税率']).toBe('6%');       // 文本原样,未做算术
  });

  it('无金额落空:amount 为 null 的行,金额单元格为空,不补 0/默认', () => {
    // 「无金额合同」是合法类别(ADR-0002),导出不得替它补数。
    const rows: ExportRow[] = [
      { 合同号: 'HT-2026-001', 金额: 5800000 },
      { 合同号: 'HT-2026-框架', 金额: null },
    ];
    const wb = buildFaithfulWorkbook(rows);
    const [, frameworkRow] = readDataRows(wb);
    expect(frameworkRow['金额'] == null || frameworkRow['金额'] === '').toBe(true);
    expect(frameworkRow['金额']).not.toBe(0);
    expect(frameworkRow['合同号']).toBe('HT-2026-框架'); // 该行其余列仍在
  });

  it('忠实照搬分口径合计行:isSummary 行原样出现,不重算、不跨口径合并', () => {
    // Agent 已按 amount_type 分组分行求和(上限/固定/预估),导出层照搬。
    const rows: ExportRow[] = [
      { 合同号: 'HT-01', 金额: 100, 口径: '上限' },
      { 合同号: 'HT-02', 金额: 200, 口径: '固定' },
      { 合同号: '上限合计', 金额: 100, 口径: '上限', isSummary: true },
      { 合同号: '固定合计', 金额: 200, 口径: '固定', isSummary: true },
    ];
    const wb = buildFaithfulWorkbook(rows);
    const out = readDataRows(wb);
    // 四行原样保留,无第五行"总计"被凭空注入
    expect(out).toHaveLength(4);
    expect(out.map((r) => r['金额'])).toEqual([100, 200, 100, 200]);
    // 未出现跨口径合并的 300
    expect(out.some((r) => r['金额'] === 300)).toBe(false);
    // isSummary 是控制标记,不落成一列
    expect(Object.keys(out[0])).not.toContain('isSummary');
  });

  it('空态:空数组不产假数据(抛错)', () => {
    // 拿不到真实结果时,绝不兜底造一份表(D2 不幻觉)。
    expect(() => buildFaithfulWorkbook([])).toThrow();
  });
});
