# Context Map

CoreMind 是声明式 Agent 框架（`packages/coremind-*`）；`jinguan-qa/` 是构建在其上的经小管合同业务应用。领域上下文按业务模块划分。

## Contexts

- [经小管查询智能体](./jinguan-qa/CONTEXT.md) — 自然语言合同提问 → 只读 Text-to-SQL → Markdown 表格（查询侧 TS）
- [经小管合同解析](./jinguan-parse/README.md) — 合同 PDF → MinerU → 抽取 + 结构感知切分 + 建向量（解析侧 Python）
- [contracts-db](./contracts-db/) — 解析写 / 查询读的共享 PostgreSQL 契约（`contracts` 29 字段 + 草稿表 + 片段表 + 种子字典）

> 说明：CoreMind 框架各 package（`packages/coremind-*`）为技术库，非业务领域上下文，其 `CONTEXT.md` 按需在各自包内惰性创建。

## Relationships

- **解析模块 → 查询智能体**：解析模块把合同 ETL 入正式库 `contracts`（经人工核对）；查询智能体**只读**该表。二者仅通过**共享 PostgreSQL** 耦合，无直接调用。
