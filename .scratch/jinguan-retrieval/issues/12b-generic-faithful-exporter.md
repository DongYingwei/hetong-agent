# 12b — 通用忠实导出器 + vitest 底座

**What to build:** 在 `excelExporter.ts` 新增一个**通用行数组 → 工作簿**的导出器:输入什么行就写什么行,**不套台账列模板、不补默认值、不做任何二次聚合**。同时给 `apps/web` 引入最小 vitest 底座 + 首个 `excelExporter.spec.ts`。这一片**离线可跑 `vitest run` 全绿,不依赖真实数据、不卡外部门(G1 / API key)**。现有的台账/订单导出器保留不动。

**Blocked by:** 12a(富格式行结构)。

**Status:** ready-for-agent

- [ ] 新增通用导出器:行数组 → 工作簿/Buffer,列由传入行决定,不补值、不合计
- [ ] `apps/web` 具备 vitest,`npx vitest run` 可执行;prior art 照搬 `apps/query-agent` 的 vitest 配置风格
- [ ] `excelExporter.spec.ts` 断言全绿:①行数守恒(输出行数==输入行数)②每格数值==输入原值(无再格式化计算、无合并)③`null`/空金额落空单元格 ④空数组 → 抛错或返回空,**不产假数据**
- [ ] 既有 `exportFullContractLedgerExcel` / `exportFullOrderLedgerExcel` 未被破坏
