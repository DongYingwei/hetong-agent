# 06 — sql_query 裸 SQL + 真 assertReadOnly + 金额/时间口径

**What to build:** `sql_query` 工具改裸 SQL(由模型生成)；`assertReadOnly` 真解析——仅单条 SELECT，拒写/多语句/注释注入；强制 LIMIT+超时；自纠错(报错→重读 schema→改写重试≤2 次，空结果只提示)；金额分口径分组求和；语义时间由 Agent 依列语义推理；「查看 SQL」折叠输出；能力边界诚实拒答。

**Blocked by:** T05(schema skill 就位后 Agent 才能生成正确 SQL)

**Status:** ready-for-agent · **HITL**（构建 AFK；部署需 G1 只读连接串）

> ⚠️ **ADR-0004 影响**：模块过滤是 **JOIN `contract_module_hits`**（如「服务内容含AI」= `JOIN contract_module_hits h ON h.contract_id=c.id WHERE h.module_key='service' AND h.hit=1`）。故 `assertReadOnly` 必须**允许多表 JOIN 的单条 SELECT**，只拒写操作/多语句(`;`)/注释注入——不能因"多表"误杀。
>
> ⚠️ **开源评测前置**：`assertReadOnly` 真解析别手写正则，先评测 **sqlglot / sqlparse**（Python 侧）或 TS 侧 SQL AST 解析库——按"有开源不自研"流程，开工时先评测并等用户确认。仅 SELECT + 单语句 + 无写关键字的判定，AST 解析比正则鲁棒。

## 九维度

- **功能范围**：入参改 `{sql:string}`；三道只读防线①②在码内；自纠错≤2；金额纪律；折叠 SQL 输出；超范围拒答。
- **非目标**：不实现向量(→T07)/RAG(→T08)；数值真值比对不在本单(G4 延后)。
- **用户/系统流程**：提问 → Agent 依 T05 schema 生成 SELECT → assertReadOnly → 只读库执行 → 表格 + 折叠 SQL。
- **数据与状态变化**：纯只读；无写。空结果只提示不放宽条件。
- **接口/模块边界**：复用现有 `coremind eval` 接缝(黑盒)；工具契约保留 `contract_ids` 入参(向后兼容 T07 联动)。
- **权限与安全 · 坑3**：**三道只读防线**：①assertReadOnly 真解析 ②LIMIT+超时 ③PG 只读角色(G1，部署前置)。拒 INSERT/UPDATE/DELETE/DROP/ALTER/GRANT/多语句/注释注入。
- **失败处理**：DB 报错原文回灌+重贴 schema，重试≤2；仍败如实报错；空结果明确提示「未检索到满足条件的记录」。
- **兼容性**：当前日期注入 systemPrompt(部署脚本)；金额 `SUM` 带 `IS NOT NULL`；税率 TEXT 不算。
- **可观察性 · 🟡 HITL 依赖**：构建全 AFK；**部署需 G1：PG 只读连接串**(第三道防线)。assertReadOnly 可纯单测，不依赖库。

## 验收标准（可观测）

- [ ] 喂 INSERT/UPDATE/DELETE/DROP/多语句/注释注入 给 `assertReadOnly` 全被拒(单测逐条)
- [ ] **多表 JOIN 的单条 SELECT 被放行**（模块查询靠 JOIN contract_module_hits，不能误杀）
- [ ] 一句模块提问（「服务内容含AI的合同」）→ 生成 **JOIN contract_module_hits WHERE module_key='service' AND hit=1** 的 SELECT，返回表格
- [ ] 一句统计提问 → 返回 Markdown 表格 + 「查看 SQL」折叠块含实际执行 SQL
- [ ] 混口径求和 → 按 `amount_type` 分组分行，不隐式合一；`SUM` 自动 `IS NOT NULL`
- [ ] 构造一次 DB 报错 → Agent 重写重试≤2；空结果 → 明确「未检索到满足条件的记录」不放宽
- [ ] 超范围/非合同问题诚实拒答，不臆造列名或数字

## 验证方法

```bash
# assertReadOnly 单测（无需库）
npm test -- sql_query.assertReadOnly
# 端到端（需 G1 只读串）：eval 结构化子集
coremind eval coremind.yaml --filter "only-sql"
```

## 完成定义

`assertReadOnly` 逐条拒写用例全绿；(需 G1)结构化子集 eval 走 sql_query 返表格+折叠 SQL；金额分口径、自纠错≤2、空结果提示、能力边界拒答均可验。
