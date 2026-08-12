# 经小管查询智能体 · 交接文档

> 写给下一个完全无上下文的新会话。读完这份就能接着干，不用从头探索。
> 最后更新：2026-08-12 · 已从设计阶段进入**实现阶段**：T01/T02/T03 完成，**T04 四切片全完成（G5 已拍板）**。

---

## 零、实现进度（2026-08-12 最新，先读这节）

### 已完成工单（真环境验证过，非仅 fake）

| 工单 | 状态 | 落盘位置 | 验证 |
|---|---|---|---|
| **T01** PG 建表+种子+配置驱动模块 | ✅ | `contracts-db/` | Docker PG16 · 27 断言绿 |
| **T02** 解析测试接缝 | ✅ | `jinguan-parse/src/.../chunking.py` | pytest 绿 |
| **T03** MinerU+LLM 抽取 | ✅ | `clients.py/schema.py/keywords.py/extract.py/persist.py` | 真端到端冒烟过（真 PDF→真 MinerU→真 DeepSeek） |
| **T04-切片1** 核对→正式库 | ✅ | `confirm.py` | 真 PG 4/4 绿 |
| **T04-切片2** 建向量 | ✅ | `vector.py` | 真 Milvus v2.4.5 + 真 embedding 集成绿 |
| **T04-切片4** 批处理+HTTP+指纹 | ✅ | `ingest.py/api.py` | 真 PG 6/6 绿 |
| **T04-切片3** 片段同步 | ✅ | `sync.py/vector.py/api.py` + DDL `002` | fake 向量+真 PG 6/6 绿 |
| **T05** schema skill 重写 | ✅ | `jinguan-qa/skills/jinguan-schema/README.md` | 24 列对齐 DDL·JOIN 明细表·grep 校验通过 |
| **T06** sql_query 裸 SQL + assertReadOnly | 🟢 构建完成 | `jinguan-qa/src/{sql_query,assertReadOnly}.ts` + `coremind.yaml` | 18 vitest 绿·tsc 通过·端到端 eval 待 G1 |
| **T07** vector_search 两阶段+双形态 | ✅ | `jinguan-qa/src/{vector_search,vectorClients}.ts` | 28 vitest 绿（含真 embed+Milvus+rerank 集成） |
| **T08** RAG 路由+出处+单合同锁定 | 🟢 构建完成 | `coremind.yaml` systemPrompt + `evals/scenarios.yaml` | 11 场景 schema 校验通过·端到端 eval 待 API key+G1 |
| **T10** Koa 网关 MySQL→PG + CoreMind 代理 | ✅ | `jingxiaoguan-master/backend/`（db.js/init_pg.sql/agentService.js） | 真 PG16 三冒烟绿（登录/CRUD/agent 代理） |

**全套 40 测试全绿**（`cd jinguan-parse && python3 -m pytest tests/`）。

### T04 已收尾 —— G5 拍板结论（2026-08-12）

- **触发方式=显式函数调用**（不引入事件/MQ 基建）：`sync_source_update` / `sync_label_update` + api `/sync/{id}/source`、`/sync/{id}/labels`。谁改数据谁显式调。
- **原文重传比 MD5**：正式库存 `mineru_md`+`mineru_md5`（DDL `002`，核对时从草稿搬运）。重传比 md5 → 同则 `unchanged` 跳过；异则更新正式库 md/md5 + `delete_by_contract` + 用新全文重切重建向量。
- **只改标签/关键字**：不重算 embedding，仅 `update_metadata_by_contract` 改 Milvus metadata（限 contract_no/field/module_category）。
- **T04 四切片全绿，无剩余待办。** 下一步转 T05/T06（查询侧）或 T10（Koa 网关）。

### 关键决策（本阶段新增，写进代码/ADR）

- **ADR-0004 模块配置驱动**：原型「合同模块」页可新增模块 → `contract_modules`(配置) + `contract_module_hits`(明细表) 替代 `contracts.mod_*` 宽列。草稿阶段模块命中存 `contracts_draft.module_hits` JSONB，核对时展开。查询侧过滤法变 `WHERE mod_service_ai=1` → JOIN 明细表（影响未实现的 T05/T06）。
- **端点**（真实值在 `jinguan-parse/.env`，被 .gitignore 挡；勿提交）：
  - MinerU `http://192.168.121.33:8000` `/file_parse`，**默认 backend=pipeline**（自包含无幻觉，已验证）。vlm-http-client(PaddleOCR-VL `:18080`)暂搁置——用户服务器上该路径当前返空 md，仅当 pipeline 解析不了时启用。
  - LLM DeepSeek 官方云，模型 `deepseek-v4-pro`，**thinking 模式 → instructor 用 `Mode.JSON`**（否则 400）。
  - embedding `.33:8008` Qwen3-Embedding-4B（vLLM OpenAI 兼容，**2560 维**）；reranker `.33:8012`（T07 用）；Milvus 本地 `localhost:19530`(v2.4.5)。
- **开源优先流程**（用户硬性要求）：开发涉及新工具/库前先评测 GitHub/npm 并等用户确认，有开源不自研。已选：openai+instructor(抽取)、pyahocorasick(关键词)、psycopg3(PG)、fastapi(HTTP)、pymilvus(Milvus)；**查询侧 TS：node-sql-parser(assertReadOnly AST 解析)+pg(只读连接池)+@zilliz/milvus2-sdk-node+openai(embedding)+vitest**。切分保留手写（合同结构专用）。**LlamaIndex 评估结论=T07 也不用**（TS 版不成熟，collection 已自建）。**LlamaIndex 评估结论=建向量不用，留 T07/T08 候选**。
- **切片逻辑**：tracer-bullet 纵向切片——每片切一条贯穿数据/后端/逻辑/测试的窄完整路径、独立可验证；先做不卡外部条件的，卡 G2/G5 的单独切出等条件。

### 项目结构（本阶段建立）

```
contracts-db/          ← 解析写/查询读的共享 PG 契约（DDL+种子+Docker 验证）
jinguan-parse/         ← 解析侧 Python（本阶段主战场）
  src/jinguan_parse/   ← config/schema/clients/keywords/extract/persist/confirm/ingest/api/vector/chunking
  tests/               ← 6 个测试文件，34 测试（fake 逻辑层 + 真 PG/Milvus 集成层）
  .env(.example)       ← 端点配置（.env 被 gitignore）
  requirements.txt     ← 锁定依赖
jinguan-qa/            ← 查询侧 TS（未动，T05+ 才碰）
```

### 抽取质量基准（G4 第一条真值）

`HJ-2024055` PDF ↔ 台账第 7 行：pipeline+v4-pro，可比 13 字段命中 10(77%)。完全对 7（含金额 31522732.8✓/上限口径/税率6%=0.06）。2 处"错"实为 **pipeline OCR 上游问题**（CMIOT→CMI0T 字形误识、2026 起止日期段漏 OCR），非抽取逻辑错——这正是 vlm-http-client(PaddleOCR-VL) 的启用判据。

### 下一步选项

1. 转 T11（前端接真实数据：MessageItem 扩 {content,tableData?,sql?,citations?}，对接网关 /api/agent/chat；T10 已给富格式契约）
2. 转 T09（eval gate：跑通 scenarios 全绿，需 DEEPSEEK_API_KEY + G1 真值）
3. 提供 **DEEPSEEK_API_KEY + G1 只读串/真值** → 跑 T06/T08 端到端 eval 验真实链路
4. 部署联调：CoreMind 需以 HTTP 暴露 /chat（网关 COREMIND_URL 指向它，契约 {message,history}→{content,tableData,sql,citations}）
4. 已提交至内网 GitLab `origin`（http://221.178.153.117:62000/weidongying/jingxiaoguan.git）；后续成果按需增量 commit

⚠️ **GitHub Issues 仍未发**（无 gh/token + 待用户授权）。所有工单仍是 `.scratch/jinguan-retrieval/issues/01–11-*.md` 本地 markdown（T01/02/03/04 已在其中标进度）。

---

## 一、我们在做什么

为**经小管合同管理智能体**建设两大查询能力：

| 能力 | 一句话 | 技术路径 |
|---|---|---|
| 结构化查询 | 自然语言→只读SQL→Markdown表格 | Text-to-SQL（模型写SQL，`assertReadOnly`真解析） |
| 语义检索(RAG) | 自然语言→向量检索→原文片段→带出处的答案 | Milvus召回50→qwen3-reranker精排8→生成答案+出处 |

**系统全景**：

| 层 | 运行时 | 职责 |
|---|---|---|
| 解析模块 | **Python** | PDF→MinerU→LLM抽20个AI字段→人工核对→写PG+建Milvus向量 |
| 查询Agent | **CoreMind/TS** (`jinguan-qa/`) | ReAct→`sql_query`+`vector_search`→Markdown答案 |
| 网关 | **Node/Koa**（`jingxiaoguan-master/backend/`，T10 已改造完） | 鉴权+运营CRUD→`/api/agent/chat`代理到CoreMind |
| 前端 | **Vue3+Element-Plus**（`jingxiaoguan-master/frontend/`） | AgentSearchView聊天+台账/核对/关键词管理——**UI已设计好，保留，只改对接真实API** |

**⚠️ 关键区分**：`jingxiaoguan-master/` 的**前端和后端都保留、都用**——前端是成品 UI，后端(T10 已迁 PG+代理 CoreMind)是**正式网关**。要废弃的只是原型的技术选型（MySQL/裸LLM/10字段合同表），正式版统一 **PostgreSQL + CoreMind + 29字段台账**。
> ⚠️ **后端不可删**：前端 axios `baseURL` 硬编码指向该后端(`:3001/api`)，深度依赖它 30+ 接口（登录/用户/角色/部门/菜单/字典/台账/关键词/范本/文件/首页/订单 CRUD + agent/chat）。删后端 = 前端全线 Network Error。仅 `/agent/chat` 转发 CoreMind，其余 CRUD 由后端自身处理。

---

## 二、已完成（已写盘，可直接用）

### 基础设施配置
| 文件 | 内容 |
|---|---|
| `AGENTS.md` | Agent skills块（issue tracker/triage labels/domain docs位置） |
| `CONTEXT-MAP.md` | 多上下文根索引（解析↔查询通过PG+Milvus耦合） |
| `docs/agents/issue-tracker.md` | GitHub Issues (`Eclipseic1848/CoreMind`)，`gh` CLI |
| `docs/agents/domain.md` | 多上下文布局 |
| `docs/agents/triage-labels.md` | 五标签：needs-triage/info/ready-for-agent/ready-for-human/wontfix |

### 领域文档
| 文件 | 内容 |
|---|---|
| `jinguan-qa/CONTEXT.md` | 查询智能体术语表16条（金额口径、模块命中、只读三防线、两阶段检索、片段同步等） |

### 架构决策记录
| 文件 | 决策 |
|---|---|
| `jinguan-qa/docs/adr/0001-*.md` | Text-to-SQL取代结构化入参，`assertReadOnly`变真解析 |
| `jinguan-qa/docs/adr/0002-*.md` | 金额分口径求和+语义时间由Agent推理（不做固定映射表） |
| `jinguan-qa/docs/adr/0003-*.md` | Milvus+qwen3两阶段+片段解析侧持久化（已获跨模块授权） |

### 需求方案
| 文件 | 内容 |
|---|---|
| `jinguan-qa/docs/经小管查询智能体模块 · 需求方案.md` | 结构化查询需求（原有v1.0） |
| `jinguan-qa/docs/合同解析模块-需求方案.md` | 解析需求（**§7.6新增**：全文片段持久化+建向量+同步） |
| `jinguan-qa/docs/经小管查询智能体-向量检索与RAG问答-需求方案.md` | 向量检索需求（grilling逐条确认） |

### Spec（3份，本地未发GitHub）
| 文件 | 范围 | 运行时 |
|---|---|---|
| `jinguan-qa/docs/specs/S1-结构化查询-text-to-sql.md` | schema重写+裸SQL+口径+自纠错 | CoreMind/TS |
| `jinguan-qa/docs/specs/S2-语义检索-rag-两阶段.md` | vector_search双形态+RAG出处+路由+单合同锁定 | CoreMind/TS |
| `jinguan-qa/docs/specs/S3-解析侧片段持久化与建向量.md` | 片段切分/持久化/建向量/同步 | Python |

### 工单（11个tracer-bullet，本地未发GitHub）
`.scratch/jinguan-retrieval/issues/01–11-*.md`，每份带blocking边+验收标准。

### 已有脚手架（需改）
| 文件 | 现状 | 需做什么 |
|---|---|---|
| `jinguan-qa/coremind.yaml` | 单Agent+2工具+session+assisted+eval | systemPrompt重写；工具配置可能需改 |
| `jinguan-qa/src/sql_query.ts` | 结构化入参+空`assertReadOnly`桩 | **重写为裸SQL** |
| `jinguan-qa/src/vector_search.ts` | 只返`contract_ids`+空`execute` | **扩展为双形态+实现召回/精排** |
| `jinguan-qa/skills/jinguan-schema/README.md` | 旧schema（仅tag_ai/tag_5g/industry等） | **重写为29字段版** |
| `jinguan-qa/evals/scenarios.yaml` | 标准三问skeleton | 补核心子集15–20题 |

---

## 三、当前不卡

> ⚠️ 本节及以下为**设计阶段**背景（2026-08-11 写）。实现进度以**第零节**（2026-08-12）为准：Phase 1 + T03 + T04 三切片已完成。

设计树frontier已清空，spec/工单/排期就位，**Phase 1可立即开工**。

**尚未做的外部动作（需用户显式授权再执行）**：
- 3份spec+11个工单尚未发GitHub Issues
- PG只读连接串、qwen3/Milvus端点、测试快照真值、模块切分章节名清单——用户控制项，未提供

---

## 四、下一步：11工单 × 5 Phase

### Blocking拓扑

```
Phase 1 ────────────→ Phase 2 ─────────────→ Phase 3 ────────→ Phase 4 ────→ Phase 5

T01(PG建表) ─┬→ T05(schema重写) → T06(sql裸SQL) ─┐
              │                                      ├→ T08(RAG路由) → T09(eval gate)
T02(解析接缝)─┴→ T03(MinerU抽取) → T04(核对建向量) ─┘
              │
              └→ T10(Koa网关适配PG+CoreMind代理) ────────────→ T11(前端接真实数据)
```

### Phase详解

| Phase | 工单 | Skill | 产物 | 验证 |
|---|---|---|---|---|
| **P1** 数据地基 | T01 PG建表+种子字典；T02 解析测试接缝 | `implement`(内部`tdd`) | DDL+种子；fake Milvus/embedding接缝 | INSERT→SELECT绿；切分断言绿 |
| **P2** 核心链路 | T03 MinerU+LLM抽取；T04 核对建向量；T05 schema skill；T10 Koa网关 | `implement`(内部`tdd`) | PDF→草稿→正式库→Milvus通；schema 29字段版；Koa PG迁移 | 端到端PDF→PG+Milvus双写；登录→CRUD正常 |
| **P3** Agent工具 | T06 sql_query裸SQL；T07 vector_search两阶段 | `implement`(内部`tdd`) | 两个工具端到端可用 | 一句提问→表格；一句语义→top_n片段 |
| **P4** 集成验收 | T08 RAG+路由；T09 eval gate | `implement`(内部`tdd`→`code-review`) | systemPrompt完整版；15–20题全绿 | `coremind eval`全绿 |
| **P5** 前端 | T11 AgentSearch接真实数据 | `implement`(内部`tdd`→`code-review`) | 无mock，SQL折叠+RAG出处UI | 前端→发话→真实PG数据→展示正常 |

### Phase间上下文管理

| 边界 | 行动 | 原因 |
|---|---|---|
| P1→P2 | Continue | 直接下游，需原样上下文 |
| P2→P3 | Continue | T06需T05的schema细节，T07需T04的chunks结构 |
| P3→P4 | Continue | T08集成T06+T07的输出契约 |
| P4→P5 | `/compact`后Continue | P5只需API契约，不需P1–P4实现细节 |

### 用户控制的关键门

| 门 | Phase | 需要什么 |
|---|---|---|
| PG只读连接串 | P3 T06部署前 | 只读角色连接串 |
| qwen3/Milvus端点 | P2 T04部署前 | embedding/reranker/Milvus连接信息 |
| 模块切分章节名清单 | P2 T03实现前 | 四模块各自"对应合同内模块名称"初始清单 |
| 测试快照真值 | 后续里程碑 | 人工核对已知真值 |
| 片段同步最终机制 | P2 T04实现设计 | 事件 vs 批量 vs 版本号 |

---

## 五、12项已确认决策（不可反复）

1. ✅ Text-to-SQL取代结构化入参；`assertReadOnly`真解析，仅单条SELECT
2. ✅ 只读三防线：语句校验+LIMIT/超时+PG只读角色（第三道部署前置）
3. ✅ 自纠错：报错重试≤2次；空结果只提示不放宽
4. ✅ 金额纪律：`SUM`带`IS NOT NULL`；跨`amount_type`分组求和不合一；税率TEXT不可算
5. ✅ 语义时间：Agent检索时推理，schema只声明物化列语义（不做映射表）
6. ✅ **数据库=PostgreSQL统一**（MySQL原型废弃）
7. ✅ 向量库=Milvus；embedding=qwen3-embedding-4B；reranker=qwen3-reranker-4B；召回50→精排8
8. ✅ 向量化范围=合同全文MinerU分段片段；切分=结构感知（章节→条款，重叠防切断）
9. ✅ RAG出处引用硬性：合同号+字段+原文片段；低相似度不编造
10. ✅ 单合同锁定首版靠session+prompt（不加显式状态工具）
11. ✅ 片段归属解析侧：持久化+建向量全在解析侧；查询只读消费。**已获跨模块授权**
12. ✅ 合同表=29字段；解析只抽20个AI列；手工列人工填；全量存储

---

## 六、绝对不要再踩的坑

### 🔴 坑1：数据库是PostgreSQL不是MySQL
`jingxiaoguan-master/plan.md`写"数据库用mysql"，`init.sql`是MySQL DDL。那是原型用的。**用户已明确Q11：统一用PG**。别碰MySQL。别改`init.sql`——它不相干。PG DDL在T01对照解析需求§5.3建29字段表。

### 🔴 坑2：旧schema skill的映射表与新决策矛盾
现有`skills/jinguan-schema/README.md`有"用户说法→过滤条件"映射表，systemPrompt说"严禁模型自行推理"。新决策（ADR-0002）是**schema只声明列语义，Agent推理**。T05必须删除旧映射表和那句"严禁自行推理"，改为声明物化列含义。

### 🔴 坑3：sql_query.ts的assertReadOnly是空桩
只加了注释说"若未来切裸SQL再实现"。T06切裸SQL后必须真解析：正则+语句解析，拒绝INSERT/UPDATE/DELETE/DROP/ALTER/GRANT/;多语句/注释注入。三道防线全上，别只靠注释。

### 🔴 坑4：vector_search.ts只返contract_ids
只设计了"语义路由到统计"一种形态。新需求还要RAG（返片段原文+出处metadata）。T07必须扩为**双形态**——Agent自主选取ids（SQL联动）或取片段（RAG生成）。别拆成两个工具。

### 🔴 坑5：jingxiaoguan-master/frontend只做UI参考
AgentSearchView的布局/样式/交互保留。但数据全是硬编码mock（`generate42Contracts`），响应结构只有`{content}`。T11把`MessageItem`扩为`{content, tableData?, sql?, citations?}`，对接真实CoreMind API。

### 🔴 坑6：解析模块(Python)和查询Agent(CoreMind/TS)是不同的运行时
解析侧一切在Python；查询侧一切在CoreMind/TS。共同契约：PG `contracts` DDL（同一份）+ Milvus schema + metadata字段名（同一套）。解析写、查询只读。

### 🔴 坑7：合同表29字段但只解析20个AI列
不要浪费时间让LLM抽全部29字段。手工列（合同号/考核线/中标编号/关联主合同号/框架简称/合同状态）人工填；系统列（断档预警）系统算。PG DDL建全29列（手工列NULLABLE）。

### 🔴 坑8：不要急着发GitHub Issues
当前一切spec和工单都是本地markdown。发GitHub是外部发布动作，需用户显式点头。新会话：读全本地文件、理解设计树后，再问用户。

### 🔴 坑9：草稿区不建向量
只有核对入正式库（`confirmed=1`）后才建向量。`contracts_draft`（`confirmed=0`）绝不建向量。这是"查询只读已背书数据"的核心保障。

### 🔴 坑10：同一轮Agent里禁止同时调sql_query和vector_search
联动路径是**串行**：vector_search返contract_ids→等它返回→sql_query传入ids统计。RAG路径只用vector_search。纯统计只用sql_query。三路径由systemPrompt引导Agent自主选，禁止并发。

---

## 七、新会话快速上手（按此顺序读）

1. `handoff.md`（当前文件）
2. `AGENTS.md`
3. `jinguan-qa/CONTEXT.md`
4. `jinguan-qa/docs/adr/0001*.md` / `0002*.md` / `0003*.md`
5. `jinguan-qa/docs/合同解析模块-需求方案.md`（注意§7.6是本次新增）
6. `jinguan-qa/docs/经小管查询智能体-向量检索与RAG问答-需求方案.md`
7. `jinguan-qa/docs/specs/S1*.md` / `S2*.md` / `S3*.md`
8. `.scratch/jinguan-retrieval/issues/01–11-*.md`（按编号顺序读）
9. `jinguan-qa/coremind.yaml`
10. `jinguan-qa/src/sql_query.ts` / `vector_search.ts` / `skills/jinguan-schema/README.md`
