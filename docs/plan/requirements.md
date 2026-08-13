# 需求层 · 经小管合同智能体

> 三层规划文档之一。**需求层**回答"要什么/为什么"。
> 关联：[分期计划 roadmap.md](./roadmap.md) · [任务分解 tasks.md](./tasks.md)
> 来源：`apps/query-agent/docs/经小管查询智能体模块 · 需求方案.md`（结构化查询）+ `…向量检索与RAG问答-需求方案.md`（语义 RAG）+ S1/S2/S3 spec。
> 最后更新：2026-08-13 · 状态：基线（需求变更见文末 §9，待用户补充）。

---

## 1. 产品目的（North Star）

为经小管合同管理提供**自然语言查询能力**：用户用大白话问合同，系统返回**准确（>90%）、可核验、不幻觉**的答案。

一句话职责：自然语言提问 →（Agent 自主判断走 SQL 统计 / 语义原文检索 / 二者联动）→ 带出处的 Markdown 答案。

---

## 2. 用户能力需求（三类问题，Agent 自主判断路径）

| 编号 | 能力 | 用户提问示例 | 路径 | 支撑工单 |
|---|---|---|---|---|
| **R1** | 纯结构化统计 | "前两季度含 AI 标签的合同总额" | `sql_query` → 表格+数值 | [T05](./tasks.md#t05) [T06](./tasks.md#t06) |
| **R2** | RAG 原文问答 | "这份合同结算条款怎么约定的" | `vector_search` → 带出处答案 | [T07](./tasks.md#t07) [T08](./tasks.md#t08) |
| **R3** | 语义路由到统计 | "岗位要求和智能巡检类似的合同有几份" | `vector_search` 返 ids → `sql_query` | [T07](./tasks.md#t07) [T08](./tasks.md#t08) |
| **R4** | 单合同锁定追问 | "这份合同的… / 那它的仲裁方式呢" | session 历史推断 contract_id + filter | [T08](./tasks.md#t08) |
| **R5** | 模块化细粒度查询 | "服务内容提到 AI 但技术要求没提的合同" | JOIN `contract_module_hits` | [T01](./tasks.md#t01) [T05](./tasks.md#t05) |

---

## 3. 硬性纪律（验收红线，不可妥协）

| 编号 | 纪律 | 说明 | 契约锚点 |
|---|---|---|---|
| **D1** | 只读 | 查询侧对正式库仅 SELECT，三道防线（assertReadOnly + LIMIT/超时 + 只读角色） | [C-READONLY](./tasks.md#契约锚点表) |
| **D2** | 不幻觉 | 查不到就说"未检索到满足条件的记录"，严禁编造合同号/字段/数字 | — |
| **D3** | 透明 | SQL 查询给"查看 SQL"折叠框；RAG 答案给"合同号+来源字段+原文引用"三要素出处 | — |
| **D4** | 金额口径 | `SUM(amount)` 一律带 `amount IS NOT NULL`；混口径（上限/固定/预估）分组不合一；tax_rate 是文本不算术 | [C-PG-SCHEMA](./tasks.md#契约锚点表) |
| **D5** | 自纠错 | SQL 报错 → 重读 schema 改写重试 ≤2 次；空结果只提示不放宽 | — |
| **D6** | 串行不并发 | 同一轮禁止并发两工具；语义路由下 `sql_query` 依赖已返回的 `vector_search` 结果 | — |
| **D7** | 只查已背书数据 | 只有核对入正式库（confirmed=1）才建向量；草稿区永不建 | [C-PG-SCHEMA](./tasks.md#契约锚点表) |

---

## 4. 数据边界（谁写谁读）

```
⑤ 解析(Python) ──写──▶ ④ 共享库(PG contracts + Milvus contract_chunks) ◀──只读── ③ 查询Agent(CoreMind/TS)
                                                                                          │
                                          ① 前端(Vue) ◀── ② 网关(Koa) ──代理── ③
```

- **解析侧写**：PDF→MinerU→LLM 抽取→人工核对→写 PG + 建向量。
- **查询侧只读**：消费 PG（结构化）+ Milvus（语义），永不写。
- **网关**：鉴权 + 运营 CRUD（独立运营库）+ `/agent/chat` 代理到查询 Agent。
- **前端**：聊天 UI + 运营管理页。
- 详见 [contracts-db 契约](../../packages/contracts-db/) 与 [CONTEXT-MAP.md](../../CONTEXT-MAP.md)。

---

## 5. 两阶段检索架构（R2/R3 核心）

```
① 召回：qwen3-embedding-4B（2560 维）→ Milvus 相似度 + 标量过滤 → top_k=50（不漏）
② 精排：qwen3-reranker-8B → 交叉打分重排 → top_n=8（最相关在前）
③ 消费：top_n 片段 → RAG 生成(带出处) 或 contract_ids → 回 PG 二次统计
```

- 混合检索：Milvus 标量存 `{contract_id, contract_no, field, module_category}`，支持先标量过滤再向量召回。
- 端点封装：embedding/reranker/Milvus 连接封在工具内、从 env 读；对 CoreMind 只暴露 read 语义。
- ⚠️ reranker 已从 4B 升级到 **8B**（2026-08-13），需求方案原文写的 4B 为历史值。

---

## 6. 验收标准

| 编号 | 标准 | 现阶段度量（用户确认 2026-08-13） |
|---|---|---|
| **V1** | SQL/RAG 准确率 >90% | **首版 gate = 轨迹正确即达标**：trajectory（路由/串行/forbiddenTools）+ response（出处完整/不幻觉）。数值真值比对延后到 G4。 |
| **V2** | 出处完整性 | 每条 RAG 答案带合同号+字段+原文引用，可人工回溯 |
| **V3** | 路由正确性 | 纯统计不触发向量；语义走精排；联动串行不并发 |
| **V4** | 不幻觉 | 低相似度/空结果明确说"未找到"，抽检 0 编造 |
| **V5** | 同步正确性 | 标签/原文更新后，检索用 metadata 与正式库一致（无过期标签命中） |

**测试库**：定量 50 题 + 定性 20 题（完整）；**首版 gate 只跑核心子集 15-20 题**（[T09](./tasks.md#t09)）。

---

## 7. 已确认关键决策（继承自需求方案 grilling）

- 检索形态 RAG + 语义路由**并存**，Agent 自主判断（无独立 Planner，靠 systemPrompt）
- 向量化范围 = **合同全文**分段片段（非仅 7 类长文本字段）
- 切分 = 结构感知（章节切父块，超长按条款切，重叠防切断），带 4 元 metadata
- 向量库 = Milvus（独立，非 pgvector）
- 会话状态 = session 历史 + prompt 推断（首版不引入显式状态工具）
- 模块 = 配置驱动（ADR-0004），过滤靠 JOIN `contract_module_hits`，非 `mod_*` 宽列
- 片段同步 = 显式函数调用 + MD5 比对（G5，非事件/MQ）

---

## 8. 非目标（首版不做）

- 数值真值比对 gate（需 G4 人工标注集）
- 相似度阈值 / top_k/top_n 调参基线（需评测数据）
- 语义相关性的人工标注数值化评测
- 多轮 turns 的 eval 场景（CoreMind eval 不支持，坑10）

---

## 9. 需求变更区（待用户补充）

> 用户 2026-08-13 表示"需求有变化，后续补"。变更逐条记于此，并回链受影响的 [任务](./tasks.md) 与 [分期](./roadmap.md)。

| # | 变更内容 | 提出日期 | 影响任务 | 状态 |
|---|---|---|---|---|
| _（待补）_ | | | | |
