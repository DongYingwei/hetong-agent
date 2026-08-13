# 12c — 导出接线 + 空态 + 去导出层假值

**What to build:** 把 `AgentSearchView` 的「导出 Excel」接到通用忠实导出器上,纯基于真实 `tableData` 逐行导出;删除 `handleExportResult` 里 `generate42Contracts()` 兜底与订单分支硬编码假值;`tableData` 空/缺失时禁用导出入口并提示"无可导出的结果",不生成文件;导出成功提示带**实际条数**,失败给可行动提示。端到端:检索真实结果 → 点导出 → .xlsx 逐行等于屏幕。

**Blocked by:** 12b(通用导出器)、T11(前端已接真实数据、检索结果不再是 mock)。

**Status:** ready-for-agent

- [ ] `handleExportResult` 仅基于真实 `tableData` 调通用导出器;代码中无 `generate42Contracts()` 或硬编码假值被导出的路径(grep + 测试校验)
- [ ] 导出 .xlsx 行数 == 屏幕结果表行数,逐行数值一致;无金额落空、不补数、不跨口径合计
- [ ] `tableData` 为空 → 导出入口禁用且提示,**不生成任何文件**
- [ ] 导出器异常 → 捕获提示"导出失败,请重试",不静默吞
- [ ] 成功提示条数 == 实际导出行数
- [ ] 端到端(依赖 T11 + G1/API key):一句统计提问 → 导出 → 肉眼核对逐行等于屏幕
