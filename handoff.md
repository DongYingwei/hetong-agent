# 经小管合同智能体 · 交接文档

> 写给一个**完全没有上下文的新会话**。读完这份 + `README.md`（有分层图+目录树），就能接着干。
> 最后更新：2026-08-13 · 状态：**T01–T08 + T10 完成；解析上传闭环(前端上传→解析→核对→入库+建向量→台账可见→删除)已打通**；T09/T11 部分推进。附 CoreMind 0.3.0-rc.2 升级评估（五点五节，未实施）。

---

## 零、最新进展（2026-08-13 · 解析上传闭环）

> 目标：**前端上传 PDF → 解析抽取 → 人工核对 → 入库 + 建向量 → 台账可见 → 可删除**。已端到端打通（curl + 后端验证过，前端待你最终点一遍）。

### 三个服务现在这样跑（本地，非部署）
| 服务 | 地址 | 起法 |
|---|---|---|
| 解析 FastAPI | `127.0.0.1:8100` | `cd apps/parse-service && PYTHONPATH=src python3 -m uvicorn jinguan_parse.api:build_default_app --factory --host 127.0.0.1 --port 8100` |
| 网关 Koa | `127.0.0.1:3002` | `cd apps/gateway && node --env-file=.env src/index.js`（**3002 不是 3001**，3001 被 root 的 `node dist/index.js` 别项目占） |
| 前端 Vite dev | `127.0.0.1:5173` | `cd apps/web && npx vite --host 0.0.0.0 --port 5173` |
| PG（查询库+运营库） | `127.0.0.1:5433` | Docker 容器 `hetong-contracts-db`（postgres:16）。5432 被别项目 `pg_ip_agent` 占，故用 5433 |
| Milvus | `localhost:19530` | 容器 `milvus-standalone` |

登录：`admin` / `admin123`。

### 两库分工（重要，见坑2 深化）
- **查询库 `contracts`**（5433 的 contracts 库）：解析写入的真实合同（52 列），**台账页现已改读这里**。
- **运营库 `contract_assistant`**（5433 的 contract_assistant 库）：**只保留基础设施表**（sys_user 登录/sys_dict 字典/sys_file 文件/contract_keyword/contract_section/…）。**合同台账表 contract_ledger 已退役**（原型种子假数据，兴晟泽那批）。

### 本轮改了什么（未提交）
**解析侧 `apps/parse-service/`**：
- `src/jinguan_parse/api.py`：`/parse` 加 `force` 参数（强制重解析，跳指纹去重）+ 回带草稿字段；新增 `GET /draft/{id}`（读草稿供核对）、`POST /confirm/{id}`（核对入库+建向量，接 overrides 人工修正）、`DELETE /contract/{id}`（删 PG 行+模块命中+Milvus 向量）。
- `src/jinguan_parse/ingest.py`：`ingest_one` 加 `force`（删同指纹旧草稿重建）。
- `src/jinguan_parse/keywords.py`：空词表健壮化（空 automaton 不再崩，match 恒返回未命中）。
- `src/jinguan_parse/taxonomy.py`（新）+ `config.py`：从台账 xlsx「AI业绩关键词」加载 60 词表；`_load_matcher` 路径按仓库根解析。
- `src/jinguan_parse/vector.py`：`MilvusVectorStore.flush()`（insert 后落盘，查询侧立即可见）。
- `scripts/ingest_real.py`（新）：一次性批量真实入库脚本。
- `requirements.txt`：+openpyxl。

**网关 `apps/gateway/`**：
- `config/index.js`：加 `queryDb`（查询库只读连接串，用 `PG_READONLY_URL` 或默认 jinguan_readonly@5433/contracts）+ `parse`（PARSE_URL 默认 8100）。
- `config/db.js`：加 `queryPool` + `queryRead()`（只读查查询库）。
- `routes/contract.js`：`/list` `/detail` 改读查询库 contracts + 字段映射（contract_status=2/verify_status=1/has_ai_keyword=tag_ai）；`/delete/:id` 改为代理解析侧 DELETE。
- `routes/parse.js`（新）：`/api/parse/{upload,draft,confirm}` 代理到解析侧，upload 透传 `force`。
- `src/index.js`：挂载 parseRoutes。
- **`.env` 改了**：DB→PG 5433（原是遗留 MySQL 3306/root）、PORT→3002、加 PARSE_URL。

**前端 `apps/web/`**：
- `src/api/parseApi.ts`（新）：upload(force)/getDraft/confirm。
- `src/utils/request.ts`：baseURL 端口 3001→**3002**（可用 VITE_API_PORT 覆盖）。
- `src/views/FileManagementView.vue`：加「上传合同并解析」按钮 → 解析 → 跳 `/verify?draftId=N`；skip（指纹去重）时弹框问「重新解析」（force）。
- `src/views/VerifyView.vue`：`?draftId=N` 走草稿模式（读 `/api/parse/draft`，编辑后 `/api/parse/confirm` 入库）；`?id=N` 运营库模式保留。

### 已知遗留（下次接手要注意）
- **抽取质量问题 B（未修）**：QC-2026015 抽取出客户名/合同名/税率/结算条款✅，但**金额/金额类型/签订日期/起止日期全空**、**模块命中全 0**。金额日期空需查（MinerU 原文有没有 / DeepSeek 抽取覆盖）；模块命中 0 是切段太窄（G4，`_slice_module_text` 只取锚点标题到下一标题，把含 AI 词的技术任务书漏在外）。这就是用户说的"解析结果不对"的真相——不是全错，是部分字段没抽出来，可在核对页人工补。
- **合同号临时值**：上传走临时文件，`ingest_one` 用文件名兜底 → contract_no 是 `tmpXXXX`。核对页应让用户改成真实合同号（人工核对该做的）。
- **Milvus stats 缓存虚高**：`get_collection_stats` 的 row_count 不实时（需 compact），判断真实向量数用 `query(filter=...)` 计数。
- **本轮改动全部未提交**：解析侧/网关/前端一大批改动 + docs/plan/ 规划文档 + 之前的 reranker 8B。

### 下次继续的入口
1. 先起上面 5 个服务（解析/网关/前端/PG/Milvus）。
2. 浏览器 5173 登录 → 文件管理「上传合同并解析」→ 核对 → 台账看结果 → 删除。
3. 要修抽取质量看「已知遗留 B」。
4. 规划全景见 `docs/plan/`（requirements/roadmap/tasks + dashboard.html）。

### ⭐ UI/交互主参照（用户 2026-08-13 确认）
**`demo/经小管-合同管理智能体原型v1.3.html`** 是后续 UI/交互的**唯一主参照**。
旧稿（`demo/…v1.0.html`、`apps/query-agent/demo/…v1.0.html`、`docs/prototype-reference/demo*.html`）保留但**不再参照**。做前端/页面前先看 v1.3。

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
| ① | 前端 | Vue3+Element-Plus | `apps/web/` |
| ② | 网关 | Node/Koa (:3001) | `apps/gateway/` |
| ③ | 查询 Agent | CoreMind/TS | `apps/query-agent/`（依赖 `vendor/coremind`） |
| ④ | 共享数据契约 | PostgreSQL + Milvus | `packages/contracts-db/` |
| ⑤ | 解析模块 | Python | `apps/parse-service/` |

---

## 二、已完成什么（真环境验证过，非仅 fake）

| 工单 | 层 | 状态 | 位置 | 验证 |
|---|---|---|---|---|
| **T01** PG 建表+种子+配置驱动模块 | ④ | ✅ | `packages/contracts-db/migrations,seeds` | Docker PG16 断言绿 |
| **T02** 解析测试接缝（结构感知切分） | ⑤ | ✅ | `chunking.py` | pytest 绿 |
| **T03** MinerU+LLM 抽取 | ⑤ | ✅ | `clients/schema/keywords/extract/persist.py` | **真端到端冒烟**（真 PDF→MinerU→DeepSeek） |
| **T04** 核对→正式库+建向量+片段同步+批处理 | ⑤ | ✅ | `confirm/vector/sync/ingest/api.py` | 真 PG + 真 Milvus v2.4.5 |
| **T05** schema skill 重写（列语义+JOIN 明细表） | ③ | ✅ | `apps/query-agent/skills/jinguan-schema/` | 24 列对齐 DDL·grep 校验 |
| **T06** sql_query 裸 SQL + assertReadOnly | ③ | 🟢 构建完成 | `apps/query-agent/src/{sql_query,assertReadOnly}.ts` | 18 vitest 绿·端到端待 G1 |
| **T07** vector_search 两阶段+双形态 | ③ | ✅ | `apps/query-agent/src/{vector_search,vectorClients}.ts` | **真 embed+Milvus+rerank 集成绿** |
| **T08** RAG 路由+出处+单合同锁定 | ③ | 🟢 构建完成 | `coremind.yaml` + `evals/scenarios.yaml` | 11 场景 schema 校验·端到端待 API key+G1 |
| **T10** Koa 网关 MySQL→PG + CoreMind 代理 | ② | ✅ | `apps/gateway/` | 真 PG16 **三冒烟绿** |

**测试全绿**：
- `cd apps/parse-service && python3 -m pytest tests/` → **40 passed**
- `cd apps/query-agent && npx vitest run` → **28 passed**（含真 .33:8008 embed + 真 localhost:19530 Milvus + 真 .33:8012 rerank 集成）

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
| **T09** eval gate | ③ | 跑通 `apps/query-agent/evals/scenarios.yaml` 全绿（trajectory/串行/诚实性断言先跑，数值真值待 G4 收紧） | 需 `DEEPSEEK_API_KEY` + G1 |

**部署联调接缝**：CoreMind（③）需以 HTTP 暴露一个 `/chat` 端点，契约 `{message, history}` → `{content, tableData?, sql?, citations?}`；网关 `COREMIND_URL` 指向它即可打通 ①→②→③。当前 CoreMind 只有 CLI（`vendor/coremind`），HTTP 暴露方式待定（可能要写个薄 HTTP wrapper 调 CoreMind SDK/CLI）——这是 T11 联调前要解决的。

工单全文（九维度 + 可观测验收 + 验证命令）在 `.scratch/jinguan-retrieval/issues/01–11-*.md`，进度已标注在各文件里。

---

## 五、绝对不要再踩的坑

### 🔴 坑1：数据库是 PostgreSQL 不是 MySQL
原型 `apps/gateway/scripts/init.sql` 是 MySQL DDL，那是废弃的。全系统统一 PG。T10 已把网关迁到 PG（`init_pg.sql`）。**别碰 `init.sql`，别引入 mysql2。**

### 🔴 坑2：两个 PG 库别混
- **④ 查询库**（`packages/contracts-db`，`contracts` 29 字段）：解析写、查询侧**只读**。
- **② 运营库**（网关的 `contract_assistant`，7 张运营表 sys_user/contract_ledger 等）：网关 CRUD 用。
二者**不是同一个库**，表结构不同（运营库 `contract_ledger` 是原型 10 字段，查询库 `contracts` 是正式 29 字段）。

### 🔴 坑3：网关(`apps/gateway`)和前端(`apps/web`)**都保留、都用**（源自原型 jingxiaoguan-master）
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
解析侧一切在 Python（`apps/parse-service`）；查询侧一切在 TS（`apps/query-agent`）。共同契约：PG `contracts` DDL + Milvus schema + metadata 字段名（同名同源）。解析写、查询只读，无直接调用。

### 🔴 坑10：CoreMind eval 场景不支持多轮 turns
源码 `vendor/coremind/packages/coremind-runtime/src/evaluation.ts:105` 硬校验每个 scenario 必须有 string `input`。**别写 `turns:` 多轮场景**，会导致整个 eval 文件校验失败。多轮单合同锁定靠 session 历史，eval 里用"点名合同的追问"在单轮验证。

### 🔴 坑11：GitHub/GitLab Issues 仍未发；推送需用户手动
所有工单是本地 markdown（`.scratch/jinguan-retrieval/issues/`），**未发到任何 issue tracker**——发布是外部动作，需用户显式授权。推送到内网 GitLab 需认证，**只能让用户在本地终端 `git push`**，别尝试把凭据写进 URL 或其他方式绕过。

### 🔴 坑12：开源优先（用户硬性要求）
涉及新工具/库前先评测 GitHub/npm 现成方案并**等用户确认**，有开源不自研。已选：解析侧 openai+instructor / pyahocorasick / psycopg3 / fastapi / pymilvus；查询侧 node-sql-parser + pg + @zilliz/milvus2-sdk-node + openai + vitest；网关 pg。切分保留手写（合同结构专用）。**LlamaIndex 评估结论=不用**（TS 版不成熟）。

### 🔴 坑13：CoreMind 无内建 HTTP server，`/chat` wrapper 要我们自己写
逐版核对（0.2.0-rc.1 → 0.3.0-rc.2）CoreMind 全线 **grep `createServer/express/koa/fastify/.listen` 零命中**——它只有 CLI（`coremind chat/run`）与库 API（`CoreMindRuntime` / `ChatSession`），**没有任何 HTTP 端点**。网关 `agentService.js` 要代理到的 `COREMIND_URL` `/chat`（契约 `{message,history}`→`{content,tableData?,sql?,citations?}`）**必须我们自己写薄 wrapper**：用 `CoreMindRuntime.create()` + `ChatSession.chat()`（走 `runAgentTurn`，复用同一预算/权限/Trace/session），把 `ChatTurnResult.text` 解析成富格式返回。**这是 T11 联调前置，上游不会帮我们解决。** 别去 vendor 里找现成 server。

### 🔴 坑14：检索能力 CoreMind 不提供，全靠自定义工具
CoreMind 定位是"配置驱动 Agent 框架"，**没有原生 RAG/向量/embedding/rerank 任何模块**（grep 零命中，0.3.x 亦然）。检索的"智能"全在我们的 systemPrompt 路由 + `sql_query`/`vector_search` 两工具。**别期待升级 CoreMind 会带来检索能力**；升级只影响 Harness/Loop/预算/上下文压缩等执行内核。

---

## 五点五、CoreMind 0.3.0-rc.2 升级评估（2026-08-13 核对，未实施）

> 现状：`vendor/coremind/` 是 **0.2.0-rc.1**；上游 tip 是 **0.3.0-rc.2**（2026-08-12）。
> 下面是逐版核对结论 + 是否升级的判断。**升级 vendor 是不可逆改动，需用户点头后再动。**

### 上游演进定性
- 0.2.0-rc.1 → 0.3.0-rc.1：大版本，落地完整 **Harness 执行内核 + Loop 状态机 + durable 恢复 + 上下文压缩 + Coding Kernel**。
- 0.3.0-rc.1 → 0.3.0-rc.2：**收口/安全版**，非功能版。新增 `run-effect-coordinator.ts`（副作用/幂等抽离，纯重构）、`not_started` Effect Receipt（审批拒绝语义）、递归脱敏、RunState 顺序校验收紧、Coding Kernel 通过判定绑真实证据。**对合同查询影响都很小**。

### 值得我们吸收的（升级动机，按性价比）
| 机制 | 文件 | 价值 |
|---|---|---|
| **多维预算成本闸** | `budget.ts` `RunBudgetController` | 现有五维（turns/toolCalls/toolFailures/tokens/costUsd）。新增 `maxTokens`/`maxCostUsd` 可给查询 Agent 上**成本上限**，直接写进 `coremind.yaml` 的 `runtime:` |
| **确定性上下文压缩** | `context.ts` `ContextProtector` | 非 LLM 的确定性摘要 + 稳定前缀指纹。**RAG 灌大量片段时防爆上下文**，可替换 yaml 里 `session.compact:true` 的 LLM 摘要（省 token 且确定性） |
| **snapshot 富格式契约** | `snapshot.ts` `RunResult.snapshot` | 跨进程/语言统一契约，是网关↔CoreMind 富格式返回（`{content,tableData,sql,citations}`）的天然载体 |

### 不受升级影响 / 不采用的
- **检索侧不动**（坑14）：无原生 RAG，两工具架构与上游理念一致。
- **HTTP wrapper 仍自己写**（坑13）：上游无内建 server。
- **Loop 引擎（xstate 规划→执行→验证→修复）先评估不实施**：当前 SQL 自纠错（≤2 次）靠 systemPrompt 文字约束，不是引擎级硬保证。若要把"自纠错 + 重复 SQL 检测"变引擎级，可评估切 `loop:` 配置——**但先确认不破坏坑7（同轮禁并发两工具）与坑10（eval 不支持多轮 turns）**。作为 T09 eval 稳定后的候选增强，不进当前关键路径。

### 升级前置（动手前必做）
1. `engines` 要 **Node ≥22.19**；依赖 `@earendil-works/pi-*` → **0.84.1**。
2. schemaVersion 仍是 **2**（`coremind.yaml`/`scenarios.yaml` 无需改结构）。
3. 升完**先跑 query-agent 28 vitest 防回归**，再跑 parse-service 40 pytest。
4. 目标版本 = **0.3.0-rc.2**（当前 tip，含安全修复，不停在 rc.1）。

---

## 六、关键端点/配置（真实值在各自 .env，被 gitignore；勿提交）

- **MinerU** `http://192.168.121.33:8000/file_parse`，默认 `backend=pipeline`（自包含无幻觉，已验证）。
- **LLM** DeepSeek 官方云，模型 `deepseek-v4-pro`，thinking 模式 → instructor 用 `Mode.JSON`（否则 400）。
- **embedding** `.33:8008` Qwen3-Embedding-4B（vLLM OpenAI 兼容，**2560 维**）。
- **reranker** `.33:8012` Qwen3-Reranker-8B。
- **Milvus** `localhost:19530`（v2.4.5），collection `contract_chunks` 由 T04 建。
- 查询侧 env：`PG_READONLY_URL`（G1）、`EMBED_BASE_URL`/`RERANK_BASE_URL`/`MILVUS_URI`。
- 网关 env：`DB_*`（PG，默认 5432/postgres）、`JWT_SECRET`、`COREMIND_URL`、`DEEPSEEK_API_KEY`。

---

## 七、新会话快速上手（按此顺序读）

1. `README.md`（分层图 + 目录树 + 进度表）
2. 本文件 `handoff.md`
3. `CONTEXT-MAP.md`（上下文边界与关系）
4. 要动查询侧：`apps/query-agent/CONTEXT.md` + `docs/adr/0001~0004*.md` + `skills/jinguan-schema/README.md`
5. 要动解析侧：`apps/parse-service/` 源码 + `packages/contracts-db/migrations/001_contracts.sql`
6. 要动网关/前端：`apps/gateway/src/` + `frontend/src/`
7. 工单细节：`.scratch/jinguan-retrieval/issues/01–11-*.md`

**先跑一遍测试确认现状**：`cd apps/parse-service && python3 -m pytest tests/`（40 绿）+ `cd apps/query-agent && npx vitest run`（28 绿）。
