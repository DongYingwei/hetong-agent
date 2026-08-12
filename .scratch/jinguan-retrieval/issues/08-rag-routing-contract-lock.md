# 08 — RAG 生成 + 出处引用 + Agent 路由 + 单合同锁定

**What to build:** RAG 答案强制标注出处(合同号+来源字段+原文引用)；低相似度不编造；Agent 自主判断三条路径(SQL 统计 / RAG 原文 / 语义路由到统计，**串行不并发**)；单合同锁定靠 CoreMind session 历史+prompt(不加显式工具)；systemPrompt 完整路由引导。端到端：一条混合提问→富格式答案+出处+表格。

**Blocked by:** T06(sql_query 通)、T07(vector_search 通)

**Status:** 🟢 构建完成（systemPrompt + eval 场景就位，schema 校验通过）· **AFK**

> ✅ **构建完成（2026-08-12）**：
> - `coremind.yaml` systemPrompt 补齐 T08 四块：
>   - **RAG 原文作答与出处**：每条依据强制标注三要素【合同号+来源字段/模块+原文引用片段】，只依据 vector_search 返回片段作答，引用原文须来自 content。
>   - **低相似度诚实**：相似度低/无关/无返回 → 「未找到足够相关的原文」，不编造合同号/字段/数字。
>   - **单合同锁定**：依对话历史推断当前 contract_id，vector_search 传 filter.contract_id 限定；无法唯一确定则反问澄清。
>   - **串行防并发（坑10）强化**：三路径全串行（纯统计只 sql_query / 纯原文只 vector_search / 联动先向量后 SQL），禁同步并发发起两工具，sql_query 的 contract_ids 必须来自已返回的 vector_search。
> - `evals/scenarios.yaml` 重写为 **11 场景**（对齐 T05 schema，删旧行业/运维措辞）：模块 JOIN 统计、金额上限口径、时间假设、语义路由到统计（vector→sql 串行）、纯 RAG 出处、低相似度诚实、单合同锁定出处、空结果、越界拒答、越域拒答。**CoreMind eval schema 校验通过**（每场景 string id+input、无非法字段、grader 类型合法）。
> - 注：CoreMind eval 场景为**单条 input**（不支持多轮 turns，源码 evaluation.ts:105 硬校验）；多轮单合同锁定靠 session 历史，eval 里用「点名合同的追问」在单轮验证。
>
> ⏳ **端到端 eval 待两条件**：①`DEEPSEEK_API_KEY`（跑真 LLM ReAct）②G1 只读库 + 真值数据（收紧 response.contains 到真编号/金额/原文）。trajectory/串行/诚实性断言不依赖真值，拿到 API key 即可先跑路由与串行。

## 九维度

- **功能范围**：RAG 生成；硬性出处；低相似度诚实；三路径路由(systemPrompt)；串行防并发；单合同锁定；完整 systemPrompt。
- **非目标**：不加显式「当前合同」状态工具(二版)；阈值调参延后；不动前端(→T11)。
- **用户/系统流程**：Agent 判提问类型 → 纯统计只用 sql_query / 语义细节走 RAG / 模糊走语义路由到统计；追问在锁定合同内检索。
- **数据与状态变化**：当前 `contract_id` 由 session 历史推断带入 filter；纯只读。
- **接口/模块边界**：集成 T06+T07 输出契约；复用 `coremind eval` 接缝。
- **权限与安全**：RAG 依据须可回溯；低于阈值如实说未找到，不幻觉。
- **失败处理 · 坑10**：**禁止同轮并发调两工具**；联动串行(sql_query 等 vector_search 返回)。
- **兼容性**：systemPrompt 含路由+金额纪律+时间推理+能力边界，覆盖 T05/T06 决策。
- **可观察性**：trajectory 可断言路由与串行；response 可断言出处三要素齐全。

## 验收标准（可观测）

- [ ] 语义细节提问 → 答案**每条依据带 合同号+字段+原文引用**(response grader 可验)
- [ ] 低相似度构造 → 答案含「未找到足够相关的原文」且不含虚假数字
- [ ] 联动提问 → trajectory 为 vector_search 先、sql_query 后，**无同轮并发**
- [ ] 先定位一合同再追问 → 追问检索**限定在该 contract_id**(filter 带入)
- [ ] systemPrompt 完整版(含路由+金额纪律+时间推理+能力边界)

## 验证方法

```bash
coremind eval coremind.yaml --filter "semantic,provenance,routing"
# 断言：出处三要素 / 不幻觉 / 串行不并发 / 单合同锁定
```

## 完成定义

出处三要素、低相似度诚实、三路径串行、单合同锁定的 eval 场景全绿；systemPrompt 完整版覆盖各决策。
