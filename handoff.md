# 经小管合同智能体 · 交接文档

> 写给一个**完全没有上下文的新会话**。读完这份 + `README.md`（有分层图+目录树），就能接着干。
> 最后更新：2026-08-12 · 状态：**T01–T08 + T10 完成，T09/T11 待办**。

---

## 一、我们在做什么

为**经小管合同管理**建两大查询能力：

| 能力 | 一句话 | 技术路径 |
|---|---|---|
| 结构化查询 | 自然语言 → 只读 SQL → Markdown 表格 | Text-to-SQL（模型写 SQL，`assertReadOnly` 真解析拦截） |
| 语义检索 RAG | 自然语言 → 向量检索 → 原文片段 → 带出处答案 | Milvus 召回 50 → qwen3-reranker 精排 8 → 生成答案+出处 |

上游有个**合同解析模块**（Python）把 PDF 经 MinerU + LLM 抽成结构化台账 + 全文向量，写入共享 PostgreSQL + Milvus；查询侧（CoreMind/TS Agent）只读消费。

### 系统五层（数据流向见 README 第二节的图）

```
用户 → ①前端(Vue3) → ②网关(Koa:3001) → ③查询Agent(CoreMind/TS) → ④共享库(PG+Milvus) ← ⑤解析(Python,写入)
```

| # | 层 | 运行时 | 目录 |
|---|---|---|---|
| ① | 前端 | Vue3+Element-Plus | `jingxiaoguan-master/frontend/` |
| ② | 网关 | Node/Koa (:3001) | `jingxiaoguan-master/backend/` |
| ③ | 查询 Agent | CoreMind/TS | `jinguan-qa/`（依赖 `vendor/coremind`） |
| ④ | 共享数据契约 | PostgreSQL + Milvus | `contracts-db/` |
| ⑤ | 解析模块 | Python | `jinguan-parse/` |

---

## 二、已完成什么（真环境验证过，非仅 fake）

| 工单 | 层 | 状态 | 位置 | 验证 |
|---|---|---|---|---|
| **T01** PG 建表+种子+配置驱动模块 | ④ | ✅ | `contracts-db/migrations,seeds` | Docker PG16 断言绿 |
| **T02** 解析测试接缝（结构感知切分） | ⑤ | ✅ | `chunking.py` | pytest 绿 |
| **T03** MinerU+LLM 抽取 | ⑤ | ✅ | `clients/schema/keywords/extract/persist.py` | **真端到端冒烟**（真 PDF→MinerU→DeepSeek） |
| **T04** 核对→正式库+建向量+片段同步+批处理 | ⑤ | ✅ | `confirm/vector/sync/ingest/api.py` | 真 PG + 真 Milvus v2.4.5 |
| **T05** schema skill 重写（列语义+JOIN 明细表） | ③ | ✅ | `jinguan-qa/skills/jinguan-schema/` | 24 列对齐 DDL·grep 校验 |
| **T06** sql_query 裸 SQL + assertReadOnly | ③ | 🟢 构建完成 | `jinguan-qa/src/{sql_query,assertReadOnly}.ts` | 18 vitest 绿·端到端待 G1 |
| **T07** vector_search 两阶段+双形态 | ③ | ✅ | `jinguan-qa/src/{vector_search,vectorClients}.ts` | **真 embed+Milvus+rerank 集成绿** |
| **T08** RAG 路由+出处+单合同锁定 | ③ | 🟢 构建完成 | `coremind.yaml` + `evals/scenarios.yaml` | 11 场景 schema 校验·端到端待 API key+G1 |
| **T10** Koa 网关 MySQL→PG + CoreMind 代理 | ② | ✅ | `jingxiaoguan-master/backend/` | 真 PG16 **三冒烟绿** |

**测试全绿**：
- `cd jinguan-parse && python3 -m pytest tests/` → **40 passed**
- `cd jinguan-qa && npx vitest run` → **28 passed**（含真 .33:8008 embed + 真 localhost:19530 Milvus + 真 .33:8012 rerank 集成）

### 各工单产出要点（新会话要改动前先看这里）

- **T04 片段同步（G5 已拍板）**：`sync.py` + `/sync` 端点。原文重传比 MD5（正式库存 `mineru_md`+`mineru_md5`，DDL `002`）——同则跳过，异则 `delete_by_contract` + 重切重建；只改标签 → `update_metadata_by_contract` 只改 Milvus metadata 不重算 embedding。**触发=显式函数调用**，不引入事件/MQ。
- **T05 schema skill**：只声明**列语义**，不写"说法→过滤条件"固定映射表（ADR-0002）；模块过滤=JOIN `contract_module_hits`（不是 `mod_*_ai` 宽列，ADR-0004）。24 查询可用列逐一对齐 DDL。
- **T06 sql_query**：入参 `{sql}`（模型生成裸 SELECT）。三道只读防线：①`assertReadOnly`（node-sql-parser AST，仅单条 SELECT，拒写/多语句/注释注入）②`capRows` LIMIT 500 + statement_timeout 8s ③`PG_READONLY_URL` 只读角色（G1，部署前置）。
- **T07 vector_search**：两阶段（embed→召回 50→rerank 8）+ **双形态**（`mode=fragments` 片段+出处 / `mode=ids` 去重 contract_ids 联动 sql_query）。单工具不拆二。
- **T08 systemPrompt**：`coremind.yaml` 含完整路由（三路径串行）+ RAG 出处三要素 + 低相似度诚实 + 单合同锁定 + 金额/时间口径。`evals/scenarios.yaml` 11 场景。
- **T10 网关**：`db.js` 用 `pg` 但保留 `query/withTransaction` 签名，方言差异（`?`→`$n`、去反引号）在 db 层吸收，~8 路由零改动。`init_pg.sql` 是运营库 DDL（7 张运营表）。`agentService.js` 代理到 `COREMIND_URL`，透传 `{content,tableData,sql,citations}`。

---

## 三、当前卡在哪

**构建层面不卡**——T11 无外部依赖可立即做。真正卡的是**端到端验证**需要用户提供的东西：

| 门 | 缺什么 | 卡住谁 |
|---|---|---|
| **G1** | PG **只读角色**连接串（环境变量 `PG_READONLY_URL`） | T06/T08/T09 端到端跑真 SQL |
| **DEEPSEEK_API_KEY** | 真 LLM 密钥（跑 CoreMind ReAct） | T08/T09 eval 跑真对话 |
| **G4** | 测试快照真值（人工核对已知答案，用于收紧 eval 的 response 断言） | T09 数值比对 gate |

已解决的门（不用再问）：**G2** 端点（embed/rerank/Milvus 都在线且已真调）、**G3** 模块锚点（种子化在 `seeds/001_dict.sql`）、**G5** 同步机制（显式函数 + MD5，T04 已收尾）。

> ⚠️ **本地代码全部提交但未推送**：`git status` 显示 `领先 origin 4 个 commit`（T07/T08/T10/文档）。**推送需用户在本地终端跑 `git push origin master`**——内网 GitLab（`http://221.178.153.117:62000/weidongying/jingxiaoguan.git`）需认证，非交互环境弹不出账号密码框。**别自己想办法绕过认证推送。**

---

## 四、下一步计划

| 工单 | 层 | 说明 | 卡点 |
|---|---|---|---|
| **T11** 前端接真实数据 | ① | `AgentSearchView.vue` 的 MessageItem 扩为 `{content, tableData?, sql?, citations?}`，对接网关 `/api/agent/chat`（T10 已给好这个富格式契约）；去掉硬编码 mock（`generate42Contracts`）；SQL 折叠块 + RAG 出处 UI | **无卡点，推荐下一个做** |
| **T09** eval gate | ③ | 跑通 `jinguan-qa/evals/scenarios.yaml` 全绿（trajectory/串行/诚实性断言先跑，数值真值待 G4 收紧） | 需 `DEEPSEEK_API_KEY` + G1 |

**部署联调接缝**：CoreMind（③）需以 HTTP 暴露一个 `/chat` 端点，契约 `{message, history}` → `{content, tableData?, sql?, citations?}`；网关 `COREMIND_URL` 指向它即可打通 ①→②→③。当前 CoreMind 只有 CLI（`vendor/coremind`），HTTP 暴露方式待定（可能要写个薄 HTTP wrapper 调 CoreMind SDK/CLI）——这是 T11 联调前要解决的。

工单全文（九维度 + 可观测验收 + 验证命令）在 `.scratch/jinguan-retrieval/issues/01–11-*.md`，进度已标注在各文件里。

---

## 五、绝对不要再踩的坑

### 🔴 坑1：数据库是 PostgreSQL 不是 MySQL
原型 `jingxiaoguan-master/backend/scripts/init.sql` 是 MySQL DDL，那是废弃的。全系统统一 PG。T10 已把网关迁到 PG（`init_pg.sql`）。**别碰 `init.sql`，别引入 mysql2。**

### 🔴 坑2：两个 PG 库别混
- **④ 查询库**（`contracts-db`，`contracts` 29 字段）：解析写、查询侧**只读**。
- **② 运营库**（网关的 `contract_assistant`，7 张运营表 sys_user/contract_ledger 等）：网关 CRUD 用。
二者**不是同一个库**，表结构不同（运营库 `contract_ledger` 是原型 10 字段，查询库 `contracts` 是正式 29 字段）。

### 🔴 坑3：`jingxiaoguan-master` 前端和后端**都保留、都用**
前端 axios `baseURL` 硬编码指向后端 `:3001/api`，深度依赖它 30+ 接口（登录/用户/角色/部门/菜单/字典/台账/关键词/范本/文件/首页/订单 + agent/chat）。**删后端 = 前端全线 Network Error。** 只有 `/agent/chat` 转发 CoreMind，其余 CRUD 后端自己处理。废弃的只是原型的**技术选型**，不是后端代码。

### 🔴 坑4：schema skill 只声明列语义，不写固定映射表
`skills/jinguan-schema/README.md` 已重写。**别加回**"用户说法→过滤条件"映射表，也别写"严禁模型自行推理"（与 ADR-0002 矛盾）。语义时间/标签由 Agent 依列语义推理。

### 🔴 坑5：模块过滤是 JOIN 不是宽列
"服务内容含 AI" = `JOIN contract_module_hits h ON h.contract_id=c.id WHERE h.module_key='service' AND h.hit=1`。**不存在 `mod_service_ai` 之类的 contracts 宽列**（ADR-0004 配置驱动）。`assertReadOnly` 必须放行多表 JOIN 的单条 SELECT（已验证）。

### 🔴 坑6：sql_query 三道只读防线缺一不可
①`assertReadOnly` AST 真解析（不是空桩、不是正则）②LIMIT+超时 ③PG 只读角色。喂 INSERT/UPDATE/DELETE/DROP/多语句/注释注入必须全拒（18 vitest 已覆盖）。

### 🔴 坑7：同一轮禁止并发调两个工具（串行）
三路径都串行：纯统计=只 sql_query；纯原文=只 vector_search；联动=先 vector_search 返回后再 sql_query。`sql_query` 的 `contract_ids` 必须来自**已返回**的 vector_search 结果。systemPrompt 已强化，别改回并发。

### 🔴 坑8：草稿区不建向量
只有核对入正式库（`confirmed=1`）才建向量；`contracts_draft`（`confirmed=0`）绝不建。这是"查询只读已背书数据"的核心保障。

### 🔴 坑9：解析(Python) 和查询(CoreMind/TS) 是不同运行时
解析侧一切在 Python（`jinguan-parse`）；查询侧一切在 TS（`jinguan-qa`）。共同契约：PG `contracts` DDL + Milvus schema + metadata 字段名（同名同源）。解析写、查询只读，无直接调用。

### 🔴 坑10：CoreMind eval 场景不支持多轮 turns
源码 `vendor/coremind/packages/coremind-runtime/src/evaluation.ts:105` 硬校验每个 scenario 必须有 string `input`。**别写 `turns:` 多轮场景**，会导致整个 eval 文件校验失败。多轮单合同锁定靠 session 历史，eval 里用"点名合同的追问"在单轮验证。

### 🔴 坑11：GitHub/GitLab Issues 仍未发；推送需用户手动
所有工单是本地 markdown（`.scratch/jinguan-retrieval/issues/`），**未发到任何 issue tracker**——发布是外部动作，需用户显式授权。推送到内网 GitLab 需认证，**只能让用户在本地终端 `git push`**，别尝试把凭据写进 URL 或其他方式绕过。

### 🔴 坑12：开源优先（用户硬性要求）
涉及新工具/库前先评测 GitHub/npm 现成方案并**等用户确认**，有开源不自研。已选：解析侧 openai+instructor / pyahocorasick / psycopg3 / fastapi / pymilvus；查询侧 node-sql-parser + pg + @zilliz/milvus2-sdk-node + openai + vitest；网关 pg。切分保留手写（合同结构专用）。**LlamaIndex 评估结论=不用**（TS 版不成熟）。

---

## 六、关键端点/配置（真实值在各自 .env，被 gitignore；勿提交）

- **MinerU** `http://192.168.121.33:8000/file_parse`，默认 `backend=pipeline`（自包含无幻觉，已验证）。
- **LLM** DeepSeek 官方云，模型 `deepseek-v4-pro`，thinking 模式 → instructor 用 `Mode.JSON`（否则 400）。
- **embedding** `.33:8008` Qwen3-Embedding-4B（vLLM OpenAI 兼容，**2560 维**）。
- **reranker** `.33:8012` Qwen3-Reranker-4B。
- **Milvus** `localhost:19530`（v2.4.5），collection `contract_chunks` 由 T04 建。
- 查询侧 env：`PG_READONLY_URL`（G1）、`EMBED_BASE_URL`/`RERANK_BASE_URL`/`MILVUS_URI`。
- 网关 env：`DB_*`（PG，默认 5432/postgres）、`JWT_SECRET`、`COREMIND_URL`、`DEEPSEEK_API_KEY`。

---

## 七、新会话快速上手（按此顺序读）

1. `README.md`（分层图 + 目录树 + 进度表）
2. 本文件 `handoff.md`
3. `CONTEXT-MAP.md`（上下文边界与关系）
4. 要动查询侧：`jinguan-qa/CONTEXT.md` + `docs/adr/0001~0004*.md` + `skills/jinguan-schema/README.md`
5. 要动解析侧：`jinguan-parse/` 源码 + `contracts-db/migrations/001_contracts.sql`
6. 要动网关/前端：`jingxiaoguan-master/backend/src/` + `frontend/src/`
7. 工单细节：`.scratch/jinguan-retrieval/issues/01–11-*.md`

**先跑一遍测试确认现状**：`cd jinguan-parse && python3 -m pytest tests/`（40 绿）+ `cd jinguan-qa && npx vitest run`（28 绿）。
