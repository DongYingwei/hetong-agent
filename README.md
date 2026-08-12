# 合同智能体 (hetong-agent)

> **新会话从这里开始。** 读完本文件 + `handoff.md` 第零节，就能接着干，不用从头探索。
> 本仓库是从 CoreMind 调研仓库剥离出的独立项目（2026-08-12 迁移）。CoreMind 框架已 vendored 到 `vendor/coremind/`。

---

## 一、我们在做什么（一句话）

为**经小管合同管理**建两大查询能力：**结构化查询**（自然语言→只读 SQL→Markdown 表格）+ **语义检索 RAG**（自然语言→向量检索→带出处的原文答案）。上游有一个**合同解析模块**（Python），把 PDF 经 MinerU + LLM 抽成结构化台账 + 全文向量，写入共享 PostgreSQL + Milvus；查询侧（CoreMind/TS Agent）只读消费。

**系统四层**：

| 层 | 运行时 | 目录 | 职责 |
|---|---|---|---|
| 解析模块 | **Python** | `jinguan-parse/` | PDF→MinerU→LLM 抽 AI 字段→人工核对→写 PG + 建 Milvus 向量 |
| 共享数据契约 | PostgreSQL | `contracts-db/` | 解析写 / 查询读的同一套表（DDL + 种子 + Docker 验证脚本） |
| 查询 Agent | **CoreMind/TS** | `jinguan-qa/` | ReAct→`sql_query`+`vector_search`→Markdown 答案（依赖 `vendor/coremind` CLI） |
| 网关 + 前端 | Node/Koa + Vue3 | `jingxiaoguan-master/` | 鉴权 + 运营 CRUD + 代理到 CoreMind；AgentSearch 聊天 UI（**参考 UI，保留，只改对接**） |

---

## 二、已完成什么（真环境验证过，非仅 fake）

| 工单 | 状态 | 位置 | 验证 |
|---|---|---|---|
| **T01** PG 建表 + 种子 + 配置驱动模块 | ✅ | `contracts-db/` | Docker PG16 · 27 断言绿 |
| **T02** 解析测试接缝（结构感知切分） | ✅ | `jinguan-parse/src/.../chunking.py` | pytest 绿 |
| **T03** MinerU + LLM 抽取 | ✅ | `clients/schema/keywords/extract/persist.py` | **真端到端冒烟**（真 PDF→真 MinerU→真 DeepSeek） |
| **T04-切片1** 核对→正式库 | ✅ | `confirm.py` | 真 PG 绿 |
| **T04-切片2** 建向量 | ✅ | `vector.py` | **真 Milvus v2.4.5 + 真 embedding** 集成绿 |
| **T04-切片4** 批处理 + HTTP + 指纹去重 | ✅ | `ingest.py` `api.py` | 真 PG 绿 |

**全套 34 测试全绿**：`cd jinguan-parse && python3 -m pytest tests/`

---

## 三、当前卡在哪 / 下一步

### 唯一进行中：T04-切片3 片段同步
卡 **G5 机制拍板**（用户控制项）：标签更新只改 metadata / 原文更新重建向量 / 按模块增量；触发方式选事件 / 批量 / 版本号。**定了就能收尾 T04。**

### 下一步可选（依赖图见 handoff 第四节）
1. 拍板 G5 → 收尾 T04 切片3
2. **T05**（schema skill，无卡点，须按 ADR-0004 声明明细表 JOIN 口径）
3. **T10**（Koa 网关 PG + 代理，无卡点）
4. T06→T07→T08→T09（查询 Agent 工具链，端点已探明）→ T11（前端）

工单全文（含九维度 + 可观测验收 + 验证命令）在 `.scratch/jinguan-retrieval/issues/01–11-*.md`。T05/T06/T07 已按最新决策刷新。

### 用户控制的门（未提供则相应工单卡部署，不卡构建）
- **G1** PG 只读角色连接串（T06 部署）
- **G4** 测试快照真值（数值比对 eval；已有第一条：`data/test-example` 合同 ↔ 台账真值）
- **G5** 片段同步机制（T04 切片3）
- G2 端点 **已解决**（见下）；G3 模块锚点 **已解决**（种子化）

---

## 四、关键配置 / 端点

真实值在 `jinguan-parse/.env`（**被 .gitignore 挡住，勿提交**；模板见 `.env.example`）：

| 用途 | 地址 | 备注 |
|---|---|---|
| MinerU | `http://192.168.121.33:8000/file_parse` | **默认 backend=pipeline**（自包含无幻觉，已验证）。vlm-http-client(PaddleOCR-VL `:18080`)暂搁置——服务端当前返空 md，仅 pipeline 解析不了时启用 |
| LLM | DeepSeek 官方云 · `deepseek-v4-pro` | **thinking 模式 → instructor 必须用 `Mode.JSON`**（否则 400） |
| embedding | `http://192.168.121.33:8008/v1/embeddings` | Qwen3-Embedding-4B，vLLM OpenAI 兼容，**2560 维** |
| reranker | `http://192.168.121.33:8012/v1/rerank` | Qwen3-Reranker-4B（T07 用） |
| Milvus | `localhost:19530`（Docker v2.4.5） | collection `contract_chunks` 已由 T04 建好，勿重建 |

**测试样本**：`data/test-example/` 有真实合同 PDF；真值台账 `demo/合同台账-V2.xlsx`（sheet「合同台账」，行3=字段名，数据从行4起）。已验第一条：`HJ-2024055` PDF ↔ 台账第7行，pipeline+v4-pro 可比字段命中 77%（2 处"错"实为 pipeline OCR 上游问题，非抽取逻辑错）。

---

## 五、绝对不要再踩的坑

1. **🔴 数据库是 PostgreSQL 不是 MySQL**。`jingxiaoguan-master` 的 MySQL/裸 LLM/10 字段表都是原型。正式版统一 PG。别碰它的 `init.sql`。

2. **🔴 模块是配置驱动的（ADR-0004），不是固定四列**。原型「合同模块」页可新增模块。已建 `contract_modules`(配置：module_key/name/anchor_names/enabled) + `contract_module_hits`(每合同×每模块一行)。查询侧模块过滤是 **JOIN 明细表**（`WHERE module_key='service' AND hit=1`），**不是** `mod_service_ai=1` 宽列。`contracts` 表已无 `mod_*` 宽列。

3. **🔴 草稿区不建向量**。只有核对入正式库（`confirmed=1`）后才建向量（坑9 核心保障）。`contracts_draft`(confirmed=0) 绝不建向量；正式库 `contracts` 有 `CHECK(confirmed=1)`。

4. **🔴 草稿模块命中存 JSONB，不建明细行**。正式表外键不能引用未入库草稿 → 草稿的模块命中存 `contracts_draft.module_hits` JSONB + 全文存 `mineru_md` 列；核对时（confirm.py）才展开成 `contract_module_hits` 行并据 md 切片建向量。

5. **🔴 DeepSeek 是 thinking 模式**。instructor 结构化抽取必须 `instructor.from_openai(client, mode=instructor.Mode.JSON)`，否则报 400 "Thinking mode does not support this tool_choice"。已在 `clients.py` 处理。

6. **🔴 MinerU 用 pipeline 后端**。vlm-http-client(PaddleOCR-VL) 当前服务端返空 md（本机 curl 也空，是服务端问题）。字形误识（CMIOT→CMI0T）、日期漏 OCR 等出现时才是 VLM 的启用判据。MinerU API 字段是 `files`(数组) + `backend`/`return_md` 是 form 字段。

7. **🔴 assertReadOnly 必须放行多表 JOIN**（T06）。模块查询靠 JOIN `contract_module_hits`，只拒写操作/多语句/注释注入，别因"多表"误杀。真解析用 sqlglot/sqlparse（评测后），别手写正则。

8. **🔴 解析(Python) 和查询(CoreMind/TS) 是不同运行时**。共同契约：`contracts-db` 的 PG DDL + Milvus collection + metadata 字段名（同一套）。解析写、查询只读。

9. **🔴 GitHub Issues 未发**。工单都是本地 markdown。发 GitHub 是外部动作，需用户显式点头（且当前无 gh/token）。

---

## 六、开发工作方式（用户硬性要求）

- **有开源不自研**：开发涉及新工具/库/MCP/skill 前，**先评测 GitHub/npm**（功能契合/star/维护/许可/依赖体积），把结果给用户，**用户确认后才动手**。已选：openai+instructor(抽取) / pyahocorasick(关键词) / psycopg3(PG) / fastapi(HTTP) / pymilvus(Milvus)。切分保留手写（合同结构专用）。**LlamaIndex 评估结论=建向量不用，留 T07/T08 检索候选**。
- **tracer-bullet 纵向切片**：每片切一条贯穿数据/后端/逻辑/测试的窄完整路径、独立可验证；先做不卡外部条件的，卡 G1/G5 的单独切出等条件。
- **真环境验证**：能跑真的就别只跑 fake。测试分两层——fake 逻辑层 + 真 PG/Milvus/端点 集成层。
- **不可逆动作先确认**：搬迁/删除/发布外部前先看清、先问。

---

## 七、快速上手（新会话按此顺序读）

1. 本 `README.md`（当前）
2. `handoff.md` **第零节**（最新进度）+ 后续节（设计背景）
3. `jinguan-qa/CONTEXT.md`（领域词汇表）
4. `jinguan-qa/docs/adr/0001~0004`（架构决策，0004 最关键=配置驱动模块）
5. `jinguan-qa/docs/specs/S1/S2/S3`（三份 spec）
6. `.scratch/jinguan-retrieval/issues/01–11`（工单，按编号）
7. `jinguan-parse/src/jinguan_parse/`（解析侧已实现代码）+ `contracts-db/migrations/001_contracts.sql`（schema）

**跑测试**：`cd jinguan-parse && python3 -m pytest tests/ -q`（需 Docker 跑临时 PG；集成层需 `.33` 端点 + 本地 Milvus 可达）。
