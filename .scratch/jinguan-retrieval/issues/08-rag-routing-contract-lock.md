# 08 — RAG 生成 + 出处引用 + Agent 路由 + 单合同锁定

**What to build:** RAG 答案强制标注出处(合同号+来源字段+原文引用)；低相似度不编造；Agent 自主判断三条路径(SQL 统计 / RAG 原文 / 语义路由到统计，**串行不并发**)；单合同锁定靠 CoreMind session 历史+prompt(不加显式工具)；systemPrompt 完整路由引导。端到端：一条混合提问→富格式答案+出处+表格。

**Blocked by:** T06(sql_query 通)、T07(vector_search 通)

**Status:** ready-for-agent · **AFK**（prompt/逻辑，无外部依赖）

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
