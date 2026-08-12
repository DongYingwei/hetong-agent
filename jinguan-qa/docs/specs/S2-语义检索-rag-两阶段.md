# Spec S2 · 语义检索（RAG + 两阶段）

> 状态：草案（本地，未发布） · 触发标签建议：`ready-for-agent`
> 关联：CONTEXT.md（语义检索术语组）、ADR-0003；上游需求 [向量检索与RAG问答需求方案](../经小管查询智能体-向量检索与RAG问答-需求方案.md)
> 依赖：**S1（联动路径依赖 sql_query）**、**S3（消费其持久化的片段与向量）**

## Problem Statement

用户想对合同库提**开放式语义问题**：某份合同的具体条款（"这份合同的结算条款怎么约定的"）、对某合同的多轮追问（"那它的仲裁方式呢"）、跨库语义检索（"岗位要求和智能巡检类似的合同"）。这些无法用结构化列命中，需要在原文语义层检索并生成带出处的答案，同时不得幻觉。

## Solution

从用户视角：随意提问，Agent 自主判断走结构化统计 / RAG 原文问答 / 语义路由到统计。语义问题经两阶段检索（Milvus 召回 → reranker 精排）取最相关片段，生成答案并**标注原文出处**；相似度不足时诚实说"未找到足够相关的原文"。

## User Stories

1. 作为经管用户，我想问某合同的具体条款内容，得到基于原文的答案 + 出处引用（合同号+字段+原文片段）。
2. 作为经管用户，我想先定位一份合同再连续追问，Agent 记住"当前在聊哪份合同"，追问只在该合同片段内检索。
3. 作为经管用户，我想问"和 X 类似/相关的合同"，Agent 用语义检索找到候选。
4. 作为经管用户，当"类似"类问题需要落到计数/求和时，我想 Agent 先语义检索拿 `contract_ids` 再交 SQL 统计（语义路由到统计）。
5. 作为经管用户，我想 Agent 自主判断该走 SQL / RAG / 联动，我不需要指定路径。
6. 作为经管用户，我想 RAG 答案的每条依据都能回溯到原文出处，以便信任与核对。
7. 作为经管用户，当没有足够相关的原文时，我想 Agent 诚实说未找到，绝不编造。
8. 作为经管用户，我想跨字段的语义问题（结算/保证金/仲裁/四模块/前言等全文）都能被命中，因为向量化范围是合同全文。
9. 作为经管用户，我想能"先按合同/字段过滤再语义检索"（混合检索），以提高精度。
10. 作为管理员，我想向量检索对向量库只读，embedding/reranker/Milvus 连接封在工具内、从 env 读，不触发 CoreMind 网络策略。

## Implementation Decisions

- **模块**：扩展 `vector_search` 工具——双输出形态（返回命中**片段原文+出处**用于 RAG；返回 `contract_ids` 用于语义路由到统计）；扩展 systemPrompt/schema 引导 Agent 自主路由。（ADR-0003、CONTEXT.md）
- **两阶段检索**（ADR-0003）：① qwen3-embedding-4B 生成查询向量 → Milvus 相似度召回 top_k=50 + 标量过滤（`contract_id/field` 等 metadata）；② qwen3-reranker-4B 交叉精排取 top_n=8。
- **消费**：top_n 片段 → RAG 生成（带出处）；或片段的 `contract_ids` → 回 PG 做 `sql_query` 二次统计。
- **联动契约**：Milvus 与 PG 不同库，靠 `contract_id` 回 PG JOIN/统计。禁止同一轮同时调两个工具——语义路由路径下 `sql_query` 依赖 `vector_search` 输出，串行。
- **单合同锁定**（CONTEXT.md）：首版靠 CoreMind session 历史 + prompt 让 Agent 推断当前 `contract_id` 并带入 `filters`，不引入显式状态工具（留二版）。
- **出处引用**（硬性）：RAG 答案标注合同号 + 来源字段 + 原文引用；精排最高分低于阈值时如实说未找到。
- **端点封装**：embedding/reranker/Milvus 连接细节封在工具内、从 env 读；对 CoreMind 只暴露 read 语义（契合 `network: deny`）。
- **消费只读**：片段与向量由 S3（解析侧）产出，本 spec 纯只读消费。

## Testing Decisions

- **好测试**：只测外部行为——提问 → 路由轨迹 + 输出（出处完整性、不幻觉），不测检索内部。
- **接缝（复用现有，同 S1，1 个）**：`coremind eval` 跑 `evals/scenarios.yaml`，新增语义场景。
- **首版 gate**：trajectory（语义问题走召回+精排；联动串行不并发；纯统计问题不触发向量检索）+ 出处完整性（答案带合同号+字段+引用）+ 不幻觉抽检（低相似度说未找到）。**语义相关性的数值化评测随测试库后续里程碑。**
- **Prior art**：`evals/scenarios.yaml` 现有 trajectory grader（`forbiddenTools`、`sequence`）。

## Out of Scope

- 结构化查询本体（→ S1）。
- 片段持久化、切分、建向量、片段同步（→ S3，解析侧）。
- 显式"当前合同"状态工具（二版增强）。
- 相似度阈值、top_k/top_n 调参基线（有评测数据后调）。

## Further Notes

- 现有 `vector_search.ts` 桩契约是"只返回 ids 供 SQL 统计"，本 spec 需扩展为双形态——注意保持向后兼容 S1 的联动路径。
- Milvus collection schema、embedding 维度、索引类型属实现细节，实现阶段定。
