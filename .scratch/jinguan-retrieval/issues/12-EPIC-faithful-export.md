# 12 — EPIC · 检索结果接真实数据 + 忠实导出 Excel

**这是总纲(EPIC),不直接实现。** 完整规格见本文件,可执行切片见下方四片工单。

**锚定:** [ADR-0005](../../../apps/query-agent/docs/adr/0005-prompt-level-planning-not-engine-planner.md)(导出=纯前端 / 忠实搬行不合计 / CoreMind 维持 0.2.0-rc.1) · [PRD](../../../docs/plan/prd-导出与验收升级.md) · [requirements §9 变更 1](../../../docs/plan/requirements.md)

---

## 目标
业务人员把检索出的合同结果表导出为 Excel:每行每数来自经人工核对的真实台账,与屏幕一致;有金额落金额、无金额(`amount IS NULL`)落空,不替补、不跨 `amount_type` 合计;无结果则禁用导出并提示,绝不兜底假数据。

## 与现状的冲突(必须修正)
当前 `AgentSearchView` 检索结果吃 `generate42Contracts()` 假数据,导出函数还有硬编码假值(`诺博汽车`/`36923.25`/税率/日期);`excelExporter.ts` 的两个导出器套**台账列模板**、会补值——这正是造假来源,违 D2/D4/Q6。

## 切片(依赖顺序)
| 片 | 标题 | Blocked by |
|---|---|---|
| [P0 → 12a-row-shape-prefactor](./12a-row-shape-prefactor.md) | 检索行结构改富格式(prefactor) | 无 |
| [12b-generic-faithful-exporter](./12b-generic-faithful-exporter.md) | 通用忠实导出器 + vitest 底座 | 12a |
| [12c-export-wiring](./12c-export-wiring.md) | 导出接线 + 空态 + 去导出层假值 | 12b、T11 |
| [12d-amount-type-summary-rows](./12d-amount-type-summary-rows.md) | 分口径合计行贯通 | T11(Agent 契约)、12c |

## 已完成 / 不重复出工单
- ✅ T01–T08、T10 已建成。
- 🟡 [T11](./11-frontend-agentsearch-real-data.md)(前端接真实数据、去 mock)已有工单,是本 EPIC 前置;**注意 T11 把"保留现有导出"列为非目标——本 EPIC 修正之:导出不是保留原样,而是改为忠实。**

## 范围外
抽取质量修复(遗留 B)、网关/Agent 侧导出、导出模板/多 sheet/样式、数值真值自动 gate(G4)、CoreMind 0.3.x / 引擎级 Planner、台账页导出入口(已有,不加)。

## EPIC 级验收(四片全绿后应成立)
- [ ] 导出 .xlsx 与屏幕结果表逐行一致(含分口径合计行),逐行数值一致
- [ ] 无金额合同在 Excel 落空,未被补数或纳入合计
- [ ] 混口径:上限/固定/预估分行,无跨口径"总计"行
- [ ] `tableData` 空 → 导出禁用 + 提示,不生成文件
- [ ] 代码无 `generate42Contracts()` 或硬编码假值被导出的路径
