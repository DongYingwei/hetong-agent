# 12a — 检索行结构改富格式(prefactor)

**What to build:** 把 `AgentSearchView` 的检索行从扁平展示结构(`TableRowItem{no,name,amount:string}`)重类型为能承载**真实台账字段** + 可选**口径/合计标记**的行;`MessageItem` 扩为真实富格式 `{content, tableData?, sql?, citations?}`。纯前端 prefactor——编译绿、现有 UI 与交互不变,不接后端、不改导出逻辑。为 T11(接真实数据)与 12b/12c/12d(忠实导出)铺路。"make the change easy, then make the easy change"。

**Blocked by:** 无 — 可立即开始。

**Status:** ready-for-agent

- [ ] `MessageItem` 含可选 `sql?` / `citations?`,类型编译通过
- [ ] 检索行结构可表达真实字段 + 可选合计行标记(`isSummary` 之类),不再是只能装展示字符串的扁平形
- [ ] 现有页面渲染/交互(表格、展开、弹窗、快捷词)行为不变,肉眼回归无差异
- [ ] 未引入后端调用、未改 `handleExportResult` 逻辑(纯类型/结构 prefactor)
