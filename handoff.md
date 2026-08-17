# 经小管合同智能体 · 交接文档

> 写给一个**完全没有上下文的新会话**。读完这份 + `README.md`（有分层图+目录树）就能接着干。
> 最后更新：2026-08-14 · 本轮有未提交的超时配置、合同模块真实数据接口/前端对齐、测试台账导入脚本与计划文档改动；历史主骨改动已在此前提交。

---

## 一、我们在做什么

为**经小管合同管理**建两大查询能力，上游有个 Python 解析模块把 PDF 抽成结构化台账 + 全文向量：

| 能力 | 一句话 | 技术路径 |
|---|---|---|
| 结构化查询 | 自然语言 → 只读 SQL → Markdown 表格 | Text-to-SQL（模型写 SQL，`assertReadOnly` AST 真解析拦截） |
| 语义检索 RAG | 自然语言 → 向量检索 → 原文片段 → 带出处答案 | Milvus 召回 50 → qwen3-reranker 精排 8 → 生成答案+出处 |

### 系统五层

```
用户 → ①前端(Vue3) → ②网关(Koa:3002) → ③查询Agent(CoreMind/TS) → ④共享库(PG+Milvus) ← ⑤解析(Python,写入)
```

| # | 层 | 运行时 | 目录 |
|---|---|---|---|
| ① | 前端 | Vue3+Element-Plus | `apps/web/` |
| ② | 网关 | Node/Koa (:3002) | `apps/gateway/` |
| ③ | 查询 Agent | CoreMind/TS | `apps/query-agent/`（工具 + wrapper） |
| ④ | 共享数据 | PostgreSQL + Milvus | `packages/contracts-db/` |
| ⑤ | 解析模块 | Python/FastAPI | `apps/parse-service/` |

**UI/交互唯一主参照**：`demo/经小管-合同管理智能体原型v1.3.html`（旧 v1.0 稿不再参照）。

---

## 二、怎么跑（本地 5 个服务 + 2 个已起的基础设施）

PG(`hetong-contracts-db`, 5433) 和 Milvus(`milvus-standalone`, 19530) 是 Docker 容器，已在跑，不用管。**开 4 个终端**：

| 服务 | 端口 | 命令 |
|---|---|---|
| 解析 FastAPI | 8100 | `cd apps/parse-service && PYTHONPATH=src python3 -m uvicorn jinguan_parse.api:build_default_app --factory --host 127.0.0.1 --port 8100` |
| 查询智能体 wrapper | 8101 | `cd apps/query-agent && npm run serve`（=`node --env-file=.env --import tsx src/server.ts`） |
| 网关 Koa | 3002 | `cd apps/gateway && node --env-file=.env src/index.js`（**3002 不是 3001**，3001 被别项目占） |
| 前端 Vite | 5173 | `cd apps/web && npx vite --host 0.0.0.0 --port 5173` |

登录 `admin / admin123`。

**两库分工（别混）**：
- **查询库 `contracts`**（5433 的 contracts 库）：解析写入的真实合同（52 列），台账页读这里。
- **运营库 `contract_assistant`**：只保留基础设施表（sys_user/sys_dict/sys_file/…）。`contract_ledger` 台账表**已退役**（原型假数据）。

---

## 三、已经完成了什么

### A. 查询侧（结构化查询已全通，真数据验证过）
- **T01–T08、T10**（历史工单）：PG 建表/种子、解析接缝、MinerU+LLM 抽取、核对入库+建向量、schema skill、sql_query（三道只读防线）、vector_search（两阶段+双形态）、RAG 路由、网关 PG 迁移。见 `docs/plan/` 与 `.scratch/jinguan-retrieval/issues/`。
- **坑13 · CoreMind HTTP wrapper**（✅ 本会话做完）：CoreMind 无内建 HTTP server，自己写薄 wrapper。
  - 文件：`apps/query-agent/src/{server,richFormat}.ts`（`GET /health` + `POST /chat {message,history}`→`{content,tableData?,sql?,citations?}`）+ `richFormat.spec.ts`（10 vitest 绿）。
  - **依赖关键**：`coremind-ai@0.3.0-rc.2`（npm 装，锁步带 runtime/config/tools/templates）+ `tsx`（devDep）。**没动 `vendor/coremind` 源码**（仍 0.2.0-rc.1 当 API 参照）。
  - **必须 tsx**：Node 24 原生 TS 不重写 `.js`→`.ts`（实测 `import './vectorClients.js'` 报 Cannot find module），而 CoreMind `loadScriptTool` 用 `import(pathToFileURL('./src/sql_query.ts'))` 动态加载工具 → 只有 tsx 进程级拦截能打通。
  - 富格式抽取：`sql` 取最后一次 sql_query 的 args.sql；`tableData` 取 `details.rows`；`citations` 取 vector_search 的 `details.fragments`；`content`=transcript。
- **T11 前端接真实数据 + 12a 行结构重类型**（✅ 本会话做完）：
  - `apps/web/src/views/AgentSearchView.vue`：去 mock、动态表格、SQL 折叠、出处 UI。
  - `apps/web/src/api/agentApi.ts`：返回类型扩 `AgentChatResult`。
  - `apps/web/src/utils/markdown.ts`（新）：模型输出是 Markdown，用 `marked`+`dompurify` 转 HTML + 消毒防 XSS。
  - 去掉了 `generate42Contracts()` 全部 mock + 硬编码假数据；历史侧栏点击改为回填标题重新真检索。
- **12b/12c 忠实导出**（历史）：`excelExporter.ts` 的 `buildFaithfulWorkbook()` 列无关忠实搬行，`faithfulExport.spec.ts` 5 测绿。

### B. 解析上传闭环（上传→解析→核对→入库→台账，主体已通）
- 解析侧 `/parse`(force)/`GET /draft/{id}`/`POST /confirm/{id}`/`DELETE /contract/{id}`；网关 `/api/parse/*` 代理；前端 `parseApi.ts`。
- **核对页渲染真实原文**（✅ 本会话修）：`VerifyView.vue` 左栏原来是硬编码假纸张（"1/12 页" + 假条款），已改为渲染 MinerU 解析的真实 Markdown。
- **台账「导入合同」改真解析**（✅ 本会话修）：`ImportContractModal.vue` 原来**100% mock**（`Math.random()` 假数据 + 假进度条 + 写退役表），已改真调 `parseApi.upload`，跳 `/verify?draftId=N`。
- **解析 API 全文返回**（✅ 本会话修）：`api.py` 的 `mineru_md_preview` 原来截断 `md[:2000]`，已改全文（否则合同"看起来不全"）。

### C. 测试现状
- `apps/parse-service` pytest → 40 passed。
- `apps/query-agent` vitest → 28 passed（但含 1 个**实时数据 flaky**：`vector_search.integration.test.ts` 期望 contract_id 101 现在返回 202，与代码无关）。
- `apps/web` vitest → 9 passed（faithfulExport 5 + markdown 4）。

### D. 2026-08-14：审核台账测试数据与设计稿对齐
- **审核台账已临时入查询库**：`demo/合同台账-V2.xlsx` 的「合同台账」59 条已用 `apps/parse-service/scripts/import_test_ledger.py` 写入 `contracts`，均标记为 `confirmed=1`，批次标识为 `test-ledger-v2-import-20260814`。仅用于 SQL/台账测试；Excel 没有合同原文，故**未生成 Milvus 向量，不能验证 RAG**。
  - 测试完成后的精确清理命令：`cd apps/parse-service && python3 scripts/import_test_ledger.py --purge`。该命令只删除上述批次及其级联明细，不碰其他合同。
- **PDF Markdown 缓存工具已补齐**：`apps/parse-service/scripts/batch_pdf_to_markdown.py <PDF目录>` 递归转换到默认的 `<PDF目录>/md-pdf/`，并写入 `manifest.json`。映射键为 PDF SHA-256，故重命名/新上传的同内容 PDF 可用 `--lookup` 命中既有 Markdown；目前仅是本地工具，上传 API 尚未自动读取该缓存。
- **60 秒超时先以完成为目标放宽**：CoreMind runtime 110 秒、网关 120 秒、前端 125 秒。直接 SQL 很快；超时来自 Agent 一次请求可能经历两轮模型生成，后续需独立做时延/模型路由优化。
- **合同台账按设计稿完成真数据对齐**：网关新增 `GET /api/contract/modules`；合同列表/详情返回真实 `contract_module_hits`；前端模块筛选和列按数据库启用模块动态生成；合同详情字段已改用实际 schema（签约主体、金额类型、结算条款等）；主布局使用设计稿头像资产。
- **订单仅完成安全的展示对齐**：名称不符标记会在后端真实返回 `name_mismatch` 时展示。运营库当前不存在 `sys_order`，订单接口仍是 mock，未实现会伪持久化的编辑功能；真实订单数据源确定后再接入。

---

## 四、当前卡在哪（按严重度排序）

### 🔴 1. 语义检索（RAG）完全没数据 —— 最硬的断点
`Milvus contract_chunks` 集合 **0 个向量**（已用 `query(expr='contract_id>=0')` 确认，不是 stats 缓存问题）。原因：已入库的 QC-2026015 **没建向量**。
- `confirm` 端点建向量是有条件的（`api.py:106`：`if row[1] and embedder is not None and store is not None`），`build_default_app` 虽配了 embedder/store，但**这份合同确认时向量没进去**（根因未查清：可能是当时服务没配好/建向量失败/或走了 `ingest_real.py` 后又被删）。
- 症状：问"结算条款怎么写的"这类语义问题，`vector_search` 召回恒空。embed/rerank/Milvus 服务本身都活着（8008/8012/19530 都 200），是**数据没灌进去**。
- 审核台账的 59 条临时数据只能验证结构化 SQL，不能替代本项；必须取得至少一份有原文的 PDF/Markdown 后经 `/confirm` 入库。
- 验证：重新确认一份含原文的合同，看 `/confirm` 返回的 `vectorized` 是不是 `true` 且 `chunks > 0`。

### 🟠 2. 字段抽取质量（遗留 B，未修）
QC-2026015 抽取出客户名/合同名/税率/结算条款✅，但**金额/金额类型/签订日期/起止日期全空**、**模块命中全 0**。
- 金额日期空 → 要查 MinerU 原文有没有这些内容 / DeepSeek 抽取覆盖。
- 模块命中 0 → 切段太窄，`_slice_module_text` 只取锚点标题到下一标题，漏了含 AI 词的技术任务书。

### 🟠 3. 12d 分口径合计行 + 金额类型（未做）
Agent 侧只有提示词"分组分行"，**无结构化 `isSummary` 标记**（前端渲染/导出已就绪，只等 Agent 给标记）。金额值经 JSON 全变字符串（BigInt→string），Excel 里是文本、加不起来。

### 🟡 4. T09 eval 门禁（未跑通）
`evals/scenarios.yaml` 11 场景 schema 校验过，但端到端跑真对话还需 **G4 数值真值标注集**（人工核对已知答案）。G1（PG 只读角色）和 DEEPSEEK_API_KEY 其实**已在 .env 且实测通**，只剩 G4。

### 🟡 5. 订单侧基本是原型假数据
「含AI订单」等查询无真实数据源，运营库也无 `sys_order` 表；订单台账/详情仍是原型假值。名称不符 UI 已预留给真实接口的 `name_mismatch` 字段，但编辑/保存必须等真实表、接口或上游服务确定。

---

## 五、下一步计划（按优先级）

1. **用一份含原文的合同打通 RAG**（最硬断点）：重新确认，抓 `/confirm` 的 `vectorized`/`chunks`；若为 0，查 `vectorize_confirmed_contract` 与解析服务日志。审核 Excel 测试批次不适用。
2. **先验证非 RAG 的结构化检索**：针对导入的 59 条审核台账，验证列表、模块过滤、Agent SQL 返回和导出；完成后执行测试批次 purge。批量 PDF 到 Markdown 后，上传 API 可继续接入本地 SHA-256 缓存以避免重复调用 MinerU。
3. **G6 订单真实数据源接入**：先确认订单表/上游 API、字段映射和写权限；再实现真实列表/详情、名称不符判断、模块映射及可持久化编辑。
4. **时延优化**：将当前 110/120/125 秒兜底改为可观测的分段耗时，减少不必要的模型轮次或切换更快模型。
5. **12d / T09 / G4**：结构化 `isSummary` + 数值类型、模块切段与真值集、端到端 eval。

---

## 六、绝对不要再踩的坑

### 已有坑（历史，详见旧文档，均仍有效）
1. **数据库是 PostgreSQL 不是 MySQL**——别碰废弃的 `init.sql`、别引入 mysql2。
2. **两个 PG 库别混**——查询库 `contracts`（解析写/查询读）≠ 运营库 `contract_assistant`（网关 CRUD），表结构不同。
3. **网关和前端都保留、都用**——前端深度依赖网关 30+ 接口，删后端 = 前端全线 Network Error。
4. **schema skill 只声明列语义**，别写"说法→过滤条件"固定映射表（ADR-0002）。
5. **模块过滤是 JOIN 不是宽列**——`JOIN contract_module_hits`，不存在 `mod_service_ai` 宽列。
6. **sql_query 三道只读防线缺一不可**——①assertReadOnly AST 真解析 ②LIMIT+超时 ③PG 只读角色。
7. **同一轮禁并发调两工具**——三路径串行，sql_query 的 contract_ids 必须来自已返回的 vector_search。
8. **草稿区不建向量**——只有 confirmed=1 入正式库才建向量。
9. **解析(Python) 和查询(TS) 是不同运行时**——共同契约 = PG DDL + Milvus schema + metadata 字段名。
10. **CoreMind eval 不支持多轮 turns**——`evaluation.ts:105` 硬校验 string `input`，别写 `turns:`。
11. **工单未发 issue tracker、推送需用户手动**——内网 GitLab 需认证，别绕过认证推送。
12. **开源优先（硬性要求）**——新库先评测现成方案并等用户确认；已选 node-sql-parser/pg/openai/marked/dompurify 等，切分保留手写。LlamaIndex 评估结论=不用。
13. **CoreMind 无内建 HTTP server**——`/chat` wrapper 自己写（已做，见第三节）。
14. **检索能力 CoreMind 不提供**——全靠 systemPrompt 路由 + `sql_query`/`vector_search` 两工具，别期待升级 CoreMind 带来检索。

### 本会话新增的坑（前端 mock 陷阱为主）
15. **台账「导入合同」原来是 100% 假解析**——`ImportContractModal.vue` 用 `Math.random()` 造假合同号/假客户 + `setTimeout` 假进度条 + 写退役 `contract_ledger` 表 + 跳 mock 的 `/verify?mode=multi`（"1/3" 3 个假 tab）。**已改成真调 `parseApi.upload`。别再给任何 mock 数据生成留后门。**
16. **核对页左栏原来是假纸张**——`VerifyView.vue` 硬编码"1/12 页" + 假条款 + 3 份 mock 合同 tab。**已改渲染 `mineru_md` 全文 + 草稿模式收成单份。**
17. **解析 API 曾截断原文**——`mineru_md_preview: md[:2000]` 只给 2000 字，合同"看起来不全"。已改全文（一份合同 40KB 级别，JSON+markdown 渲染可接受）。
18. **前端历史回放 assistant content 必须数组形式**——`toCoreMindMessages` 要把字符串 content 转 `[{type:'text',text}]`，否则 pi-agent-core 静默丢弃 → 空轮（实测踩过）。
19. **agentApi.chat 是单参对象**——`chat({ message, history })`，别写成两参（原 bug：body 成了裸字符串，网关 400）。history 只发本轮之前的对话。
20. **RAG 无数据先查 Milvus 向量数**——别只看 contracts 表有记录就以为 RAG 通。用 `Collection.query(expr='contract_id>=0')` 计数（`num_entities`/`get_collection_stats` 不可靠）。
21. **审核 Excel 台账不是 RAG 数据**——它没有合同原文；`import_test_ledger.py` 的 59 条仅供 SQL/台账测试，清理只能用带批次标记的 `--purge`，不要手工按合同号批量删。
22. **订单 mock 不能冒充真实能力**——没有 `sys_order`/上游数据源时，不要接“保存成功”的编辑接口；先落真实数据契约。

---

## 七、关键端点/配置（真实值在各自 .env，被 gitignore；勿提交）

- **MinerU** `http://192.168.121.33:8000/file_parse`，`backend=pipeline`。
- **LLM** DeepSeek 官方云，模型 `deepseek-v4-pro`，thinking 模式 → instructor 用 `Mode.JSON`。
- **embedding** `.33:8008` Qwen3-Embedding-4B（**2560 维**）；**reranker** `.33:8012` Qwen3-Reranker-8B；**Milvus** `localhost:19530` collection `contract_chunks`。
- 查询侧 env：`PG_READONLY_URL`、`DEEPSEEK_API_KEY`、`EMBED_BASE_URL`/`RERANK_BASE_URL`/`MILVUS_URI`（都在 `apps/query-agent/.env`，**已填真值**）。
- 网关 env：`DB_*`、`JWT_SECRET`、`COREMIND_URL=http://127.0.0.1:8101/chat`、`DEEPSEEK_API_KEY`、`PARSE_URL=http://127.0.0.1:8100`。

---

## 八、新会话快速上手

1. 读 `README.md`（分层图+目录树）+ 本文件。
2. 起 4 个服务（见第二节）。
3. **先跑测试确认现状**：`cd apps/parse-service && python3 -m pytest tests/`（40 绿）+ `cd apps/query-agent && npx vitest run`（28 绿，1 个实时数据 flaky）+ `cd apps/web && npx vitest run`（9 绿）。
4. 要动查询侧：`apps/query-agent/src/` + `skills/jinguan-schema/README.md` + `docs/adr/0001~0005*.md`。
5. 要动解析侧：`apps/parse-service/src/jinguan_parse/` + `packages/contracts-db/migrations/001_contracts.sql`。
6. 工单细节：`.scratch/jinguan-retrieval/issues/`；规划全景：`docs/plan/`。

---

## 附：git 状态与推送

- **当前待提交（2026-08-14）**：`apps/query-agent/coremind.yaml`（运行时超时）、`apps/gateway/src/{config/index.js,routes/contract.js}`（超时与真实模块接口）、`apps/web`（合同模块 UI、详情字段、设计头像、订单名称不符展示、请求超时）、`apps/parse-service/scripts/import_test_ledger.py`（测试批次导入/清理）、`scripts/batch_pdf_to_markdown.py` 与 `pdf_markdown_cache.py`（PDF→Markdown SHA-256 缓存）、本交接与 `docs/plan/`。
- 已提交未推送的（历史）：T07/T08/T10 等，`领先 origin N 个 commit`。**推送需用户在本地终端 `git push origin master`**（内网 GitLab 需认证，非交互环境弹不出密码框，别绕过）。
