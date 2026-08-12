# 07 — vector_search 两阶段检索(召回50→精排8)

**What to build:** `vector_search` 工具扩展为双形态：①返回命中**片段原文+metadata**供 RAG；②返回 `contract_ids` 供语义路由到 SQL。qwen3-embedding 召回 top_k=50 + Milvus 标量过滤(contract_id/field 等)→ qwen3-reranker 精排 top_n=8。端点 env 封装。混合检索(先标量过滤再向量)。端到端：一句语义提问→top_n 片段。

**Blocked by:** T06(联动契约——sql_query 需要 contract_ids 列表)、T04(Milvus 里有向量数据可查)

**Status:** ready-for-agent · **AFK**（G2 端点已探明；仅需 T04 灌数据）

> ✅ **端点契约已确认(2026-08-12 真调)**——G2 大部分解决：
> - **embedding** `http://192.168.121.33:8008/v1/embeddings`（vLLM **OpenAI 兼容**），模型 `Qwen3-Embedding-4B`，**2560 维**。TS 侧用 openai 兼容 client 调即可。
> - **reranker** `http://192.168.121.33:8012/v1/rerank`（vLLM），模型 `Qwen3-Reranker-4B`，max_len 1024。
> - **Milvus** `localhost:19530`（standalone v2.4.5），collection **`contract_chunks`** 已由 T04-切片2 建好：字段 `vector(2560,COSINE)` + metadata 四字段(`contract_id/contract_no/field/module_category`) + `content`。**T07 直接查此 collection，schema 已定，勿重建**。
> - `module_category` 存空串（非 None）；`field` 对模块段=module_key（service/tech/…）。标量过滤按这些字段。
>
> ⚠️ **开源评测(T07/T08 主场)**：本单可评 **LlamaIndex**（两阶段检索/VectorStore 抽象）——上阶段结论是"建向量不用它，留 T07/T08 候选"。开工时按流程评测 llama-index-vector-stores-milvus 是否比手写 pymilvus 查询+rerank 更值，等用户确认。

## 九维度

- **功能范围**：双输出形态；embedding 召回50 + 标量 filter；reranker 精排8；混合检索(先标量后向量)；端点 env 封装。
- **非目标**：不做 RAG 生成/路由(→T08)；**不拆成两个工具(坑4)**；阈值/topK 调参延后。
- **用户/系统流程**：语义提问 → embed → Milvus 召回50 → rerank 8 → 返回片段(RAG)或 ids(路由)。
- **数据与状态变化**：纯只读消费 T04 产出的片段/向量；无写。
- **接口/模块边界 · 坑4**：单工具双形态，不拆二；保留 S1 联动契约(输出 ids 供 sql_query)。
- **权限与安全**：embedding/reranker/Milvus 端点封在工具内、env 读；对 CoreMind 只暴露 read(契合 `network:deny`)。
- **失败处理**：端点不可达 → 工具报错回灌，Agent 如实说检索失败，不编造片段。
- **兼容性**：向后兼容 S1 联动路径；metadata filter 字段名对齐 T02/T04。
- **可观察性**：端点已探明(见顶部)；**仅需 T04 灌向量数据**方可真检索。fake 客户端可先验双形态契约；真集成可连 `.33:8008`/`.33:8012`/`localhost:19530`。

## 验收标准（可观测）

- [ ] 一句语义提问 → embed(2560维) → 查 Milvus `contract_chunks` 召回 top_k=50 → rerank top_n≤8，每片带 `contract_id`/`contract_no`/`field`/`module_category`
- [ ] 同工具另一形态 → 返回去重 `contract_ids` 供 sql_query 联动(单工具双形态)
- [ ] 混合检索：带标量 filter(如 `contract_id==X` 锁定合同 / `field=='service'`)时召回被**正确缩小**
- [ ] 端点全从 env 读(embedding `.33:8008` / reranker `.33:8012` / Milvus `localhost:19530`)；工具对 CoreMind 声明 read
- [ ] 保持向后兼容 S1 联动路径(sql_query 能接收 contract_ids)

## 验证方法

```bash
# 双形态契约单测（fake embed/rerank/Milvus）
npm test -- vector_search.two-stage
# 集成（需 G2 + T04 数据）：一句语义 → 断言 top_n 片段结构
coremind eval coremind.yaml --filter "semantic"
```

## 完成定义

双形态契约单测绿(片段+出处 / contract_ids)；(需 G2+T04)集成一句语义返 top_n≤8 片段带四字段 metadata；混合检索缩小召回可验；S1 联动兼容。
