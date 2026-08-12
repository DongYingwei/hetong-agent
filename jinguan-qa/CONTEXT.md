# 经小管查询智能体 (Query Agent)

理解用户对合同库的自然语言提问，自主编排结构化统计（Text-to-SQL）与语义原文检索（RAG），汇总为带出处的 Markdown 答案的单 Agent 上下文。只读正式库 `contracts` 与向量库，与解析模块通过共享数据存储解耦。

## Language

**正式库 (Formal DB)**：
经人工核对背书的合同记录所在表 `contracts`。查询智能体只读此表——库内数据的可信度由人工核对保证，这是 >90% 准确率的核心前提。
_Avoid_: 草稿区、contracts_draft（那是解析模块的中间态，查询不碰）

**金额口径 (Amount Type / `amount_type`)**：
一笔合同金额的性质——上限 / 固定 / 预估三种之一。不同口径的金额语义不可比，求和时不得隐式合一。
_Avoid_: 金额类型（"类型"一词已被 contract_type 占用）

**分口径求和 (Grouped Sum)**：
当结果集混含多种 `amount_type` 时，按口径分组分别求和并在表格分行标注，而非把上限/固定/预估直接相加。是"金额混加失真"的对策。

**无金额合同 (Null-Amount Contract)**：
`amount IS NULL` 的合法合同类别（如框架协议）。是一个可查询的类别，不是缺失数据；`SUM(amount)` 一律须带 `WHERE amount IS NOT NULL`。

**模块命中 (Module Hit / `mod_*_ai`)**：
四模块（服务内容 mod_service / 技术要求 mod_tech / 岗位说明 mod_role / 人员需求 mod_staff）各自独立的 AI 关键词命中标记（0/1），由解析模块预存。支撑细粒度查询（如"服务内容含 AI 但技术要求未提"= `mod_service_ai=1 AND mod_tech_ai=0`）。
_Avoid_: AI 标签（那专指合同级汇总的 tag_ai）

**合同级 AI 标签 (`tag_ai`)**：
四模块任一命中即为 1 的合同级汇总标记。与模块级 `mod_*_ai` 是"汇总 vs 细粒度"的关系，不可混用。

**物化时间列 (Materialized Time Columns)**：
`sign_year` / `sign_quarter` / `sign_half` / `end_year`——入库时从 `sign_date`/`end_date` 预计算的离散列。查询按这些列过滤时间，其**列语义**（如 `sign_half=1` 即上半年含 Q1Q2）是确定性事实；由自然语言短语（"前两季度"）到该用哪列的**推理**归智能体，不做固定映射表。

**语义时间推理 (Semantic Time Reasoning)**：
智能体把"前两季度""去年下半年"等自然语言时间短语翻译为物化时间列过滤条件的能力。推理在检索时由 Agent 完成，schema 只提供列语义，不提供"说法→条件"查表。

**只读三防线 (Read-Only Defense)**：
保证查询绝不触发写操作的三道兜底：① `assertReadOnly` 单条 SELECT 语句级校验；② 强制 LIMIT + 语句超时；③ PostgreSQL 只读角色连接。前两道在代码内，第三道是部署前置。

**自纠错 (Self-Correction)**：
SQL 执行报错时，Agent 借 CoreMind assisted 循环捕获错误、重读 schema、改写重试（上限 2 次）的机制。空结果只提示、不自动放宽条件。

## 语义检索 (Semantic Retrieval)

**分段片段 (Chunk)**：
解析阶段由 MinerU 产出、按结构切分并持久化的一段合同原文，是向量检索的最小单位。每片带 `{contract_id, contract_no, field, module_category}` 元数据，用于混合过滤与出处标注。
_Avoid_: 全文块、段落（"分段片段"特指入向量库的单位）

**两阶段检索 (Recall → Rerank)**：
先用 qwen3-embedding-4B + Milvus 向量相似度**召回** top-K（较大，追求不漏），再用 qwen3-reranker-4B 对片段与提问**精排**取 top-N（较小，追求最相关在前）的两段式检索。是语义问答精度的核心保障。

**检索增强问答 (RAG)**：
用两阶段检索命中的原文片段作为依据、由模型生成自然语言/表格答案并**引用出处**的问答形态。区别于"语义路由到统计"——后者向量检索只返回 `contract_ids` 交 SQL 二次统计。
_Avoid_: 原文问答（统一叫 RAG）

**语义路由到统计 (Semantic Routing)**：
当"类似/相关"类模糊提问需要落到计数/求和时，向量检索只返回 `contract_ids`，再交 `sql_query` 二次统计的联动路径。与 RAG 是"要不要生成原文答案"的区别，由 Agent 按提问自主选择。

**单合同锁定 (Contract Lock)**：
用户定位到某份合同后，追问只在该合同片段内检索的会话模式。首版靠 CoreMind session 历史 + prompt 让 Agent 推断当前 `contract_id` 并带入过滤，不引入显式状态工具。

**出处引用 (Provenance)**：
RAG 答案必须标注的依据来源：命中片段的合同号 + 来源字段 + 原文引用。是语义问答对应 SQL"查看 SQL 折叠框"的透明度要求；相似度低于阈值时如实说"未找到足够相关的原文"，不编造。

**片段同步 (Chunk Sync)**：
当解析侧的合同标签或原文更新时，向量库中对应片段的向量与 metadata 必须及时随之更新的一致性要求。四模块片段独立存储，可按模块粒度增量重建，避免整份重跑。
