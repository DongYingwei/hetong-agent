# Context Map

CoreMind 是声明式 Agent 框架（`packages/coremind-*`）；`jinguan-qa/` 是构建在其上的经小管合同业务应用。领域上下文按业务模块划分。

> 系统分层与目录树见 [README.md](./README.md) 第二、三节。本文件聚焦领域上下文的**边界与依赖关系**。

## Contexts

- ⑤ [经小管合同解析](./jinguan-parse/README.md) — 合同 PDF → MinerU → 抽取 + 结构感知切分 + 建向量（解析侧 Python，**写入**共享库）
- ④ [contracts-db](./contracts-db/) — 解析写 / 查询读的共享 PostgreSQL 契约（`contracts` 29 字段 + 草稿表 + 片段表 + 种子字典）；配套 Milvus `contract_chunks` 向量库
- ③ [经小管查询智能体](./jinguan-qa/CONTEXT.md) — 自然语言合同提问 → Text-to-SQL(只读) + 两阶段向量检索 → 带出处答案（查询侧 CoreMind/TS，**只读**共享库）
- ② 网关（`jingxiaoguan-master/backend/`）— Koa：鉴权 + 运营 CRUD（独立运营库 `contract_assistant`）+ `/api/agent/chat` 代理到 ③
- ① 前端（`jingxiaoguan-master/frontend/`）— Vue3：聊天 UI + 运营管理页，经 ② 访问全部能力

> 说明：CoreMind 框架各 package（`vendor/coremind/packages/coremind-*`）为技术库，非业务领域上下文。

## Relationships

- **⑤ 解析 → ④ 共享库 → ③ 查询智能体**：解析把合同 ETL 入正式库 `contracts`（经人工核对）+ 建 Milvus 向量；查询智能体**只读**消费。三者仅通过**共享 PostgreSQL + Milvus** 耦合，无直接调用。
- **① 前端 → ② 网关 → ③ 查询智能体**：前端所有请求经网关（`:3001`）；网关处理运营 CRUD（走运营库），仅 `/agent/chat` 无状态转发到查询智能体。
- **两库分离**：④ 查询库 `contracts-db`（只读消费）与 ② 运营库 `contract_assistant`（网关 CRUD）是**不同的库**，勿混。
