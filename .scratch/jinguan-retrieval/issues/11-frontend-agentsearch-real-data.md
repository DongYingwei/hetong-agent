# 11 — 前端 AgentSearch 接真实数据 + RAG UI

**What to build:** `AgentSearchView.vue` 替换硬编码 mock 数据(`generate42Contracts`)；响应结构从 `{content}` 扩为 `{content, tableData, sql?, citations?}`；新增「查看 SQL」折叠框；RAG 出处标注(合同号+字段+原文引用块)；低置信度提示 UI；保留现有 Excel 导出、检索历史、合同/订单详情弹窗。前端→发一句话→Agent 返回真实 PG 数据→表格/出处/SQL 展示正常。

**Blocked by:** T10(Koa 网关 `/agent/chat` 通了)、T09(Agent eval gate 绿，端到端验证过)

**Status:** ready-for-agent · **AFK**（契约驱动 UI 对接）

## 九维度

- **功能范围**：移除 mock；`MessageItem` 扩 `sql?`/`citations?`；查看 SQL 折叠；出处标注；低置信度提示；保留导出/历史/弹窗。
- **非目标 · 坑5**：**保留现有布局/样式/交互**——只改对接真实 API，不重设计 UI。
- **用户/系统流程**：发一句话 → Koa `/agent/chat` → CoreMind → 富格式返回 → 表格/SQL 折叠/出处块渲染。
- **数据与状态变化**：前端消费真实响应；无 mock 状态；检索历史调真实 API。
- **接口/模块边界**：依赖 T10 的 `{code,msg,data}` 契约 + T08/T09 验过的富响应形态。
- **权限与安全**：沿用 Koa 鉴权；前端不直连 DB/CoreMind。
- **失败处理**：低相似度 → 黄色提示条「未找到足够相关的原文」；接口错误 → 友好提示不白屏。
- **兼容性**：Excel 导出适配新字段；快捷检索词条更新为新表结构术语。
- **可观察性**：跑起前端发一句真实提问，肉眼验表格 + SQL 折叠 + 出处块(/run 或 /verify)。

## 验收标准（可观测）

- [ ] `generate42Contracts` 已移除；一句统计提问 → 渲染真实 PG 数据表格
- [ ] 「查看 SQL」折叠框在 AI 气泡下展示实际执行 SQL；与表格同级
- [ ] 语义提问 → 出处块含合同号+字段+原文引用，悬停高亮；低置信度显黄条
- [ ] Excel 导出/检索历史/详情弹窗基于真实数据正常工作
- [ ] 快捷检索词条更新为新表结构术语

## 验证方法

```bash
# 起前端 + Koa + CoreMind，肉眼端到端验证
npm run dev
# 发「服务内容含AI的合同有多少」→ 表格+SQL折叠
# 发「这份合同结算条款怎么约定」→ RAG 答案+出处块
```

## 完成定义

mock 移除；富响应(表格/SQL 折叠/出处/低置信度)渲染正常；导出/历史/弹窗基于真实数据；端到端一句话→真实 PG 数据肉眼验证通过。
