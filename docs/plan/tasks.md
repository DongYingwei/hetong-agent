# 任务层 · 经小管合同智能体

> 三层规划文档之一。**任务层**回答"具体做什么"。
> 关联：[需求 requirements.md](./requirements.md) · [分期计划 roadmap.md](./roadmap.md)
> 主骨 = 现有 11 份工单 T01–T11（`.scratch/jinguan-retrieval/issues/`，含九维度验收）；补本轮新发现的缺口任务 G-*。
> 最后更新：2026-08-13。

**状态图例**：✅ 完成 · 🟢 构建完成待端到端 · ⏳ 未做 · 🔴 阻塞

---

## 契约锚点表

> 多个任务共享的"接口契约"。**改任一契约 → 顺 "影响任务" 列看波及面**。这是"改后面不影响前面"的总控中枢。

| 锚点 | 定义位置 | 契约内容 | 定义任务 | 影响任务（消费方） |
|---|---|---|---|---|
| **C-PG-SCHEMA** | `packages/contracts-db/migrations/001,002` | `contracts` 29 字段 + `contracts_draft` + `contract_modules` + `contract_module_hits` + `contract_chunks`；物化时间列语义；`CHECK(confirmed=1)` | [T01](#t01) | [T03](#t03) [T04](#t04) [T05](#t05) [T06](#t06) [G1](#g1) [G2](#g2) |
| **C-MILVUS** | `contract_chunks` collection | vector 2560 COSINE + metadata 四字段 `{contract_id,contract_no,field,module_category}` + content | [T04](#t04) | [T07](#t07) [G2](#g2) |
| **C-READONLY** | `sql_query.ts` + PG 只读角色 | 单条 SELECT（assertReadOnly AST）+ LIMIT 500/超时 8s + `jinguan_readonly` 角色 | [T06](#t06) | [T08](#t08) [T09](#t09) [G1](#g1) |
| **C-VECTOR-TOOL** | `vector_search.ts` | 两阶段召回50→精排8；双形态 `mode=fragments\|ids`；filter 标量过滤 | [T07](#t07) | [T08](#t08) [T09](#t09) |
| **C-CHAT** | `/chat` HTTP 契约 | `{message,history}` → `{content, tableData?, sql?, citations?}` | [G3](#g3) | [T10](#t10) [T11](#t11) |
| **C-TAXONOMY** | 台账「AI业绩关键词」sheet | 60 词 / 10 大方向 → KeywordMatcher `{category:[words]}` | [G2](#g2) | [T04](#t04)（模块命中） |

---

## 主骨任务（T01–T11）

### T01 — PG 建表 + 种子 + 配置驱动模块 {#t01}
- **层**：④ 共享契约 · **状态**：✅（Docker PG16 断言绿）
- **做什么**：`contracts`(29 字段) + 草稿表 + 片段表 + 配置驱动模块表 + 枚举字典种子。
- **依赖↑**：无 · **影响↓**：T03/T04/T05/T06/G1/G2（全靠这套 schema）
- **契约**：定义 [C-PG-SCHEMA](#契约锚点表) [C-MILVUS](#契约锚点表)

### T02 — 解析测试接缝（结构感知切分） {#t02}
- **层**：⑤ 解析 · **状态**：✅（pytest 绿）
- **做什么**：`process_one_contract` 函数边界 + 结构感知切分 + metadata 四字段。
- **依赖↑**：无 · **影响↓**：T03/T04

### T03 — MinerU + LLM 抽取 {#t03}
- **层**：⑤ 解析 · **状态**：✅（真端到端冒烟）
- **做什么**：PDF→MinerU markdown→DeepSeek 抽 17 标量 AI 字段 + 模块切分 + 关键词命中→草稿。
- **依赖↑**：T01(schema) T02(切分) · **影响↓**：T04/G4

### T04 — 核对→正式库 + 建向量 + 片段同步 + 批处理 {#t04}
- **层**：⑤ 解析 · **状态**：✅（真 PG + 真 Milvus，40 pytest 绿）
- **做什么**：草稿核对入正式库(confirmed=1) + 展开模块命中明细 + 建向量写 Milvus + 片段同步(MD5)。
- **依赖↑**：T03 · **影响↓**：G2（真实入库消费它）
- **契约**：定义 [C-MILVUS](#契约锚点表)

### T05 — schema skill 重写（列语义 + JOIN 明细表） {#t05}
- **层**：③ 查询 · **状态**：✅（24 列对齐 DDL）
- **做什么**：数据字典 skill，只声明列语义（不写固定映射表），模块过滤=JOIN。
- **依赖↑**：T01(schema) · **影响↓**：T06/T08（注入 systemPrompt）

### T06 — sql_query 裸 SQL + assertReadOnly {#t06}
- **层**：③ 查询 · **状态**：🟢 18 vitest 绿 · **端到端待 [G1](#g1)**
- **做什么**：模型生成裸 SELECT → 三道只读防线执行。
- **依赖↑**：T01(schema) T05(字典) · **影响↓**：T08/T09
- **契约**：定义 [C-READONLY](#契约锚点表)

### T07 — vector_search 两阶段 + 双形态 {#t07}
- **层**：③ 查询 · **状态**：✅（28 vitest 含真集成）
- **做什么**：embed→Milvus 召回50→rerank 精排8；mode=fragments/ids 双形态。
- **依赖↑**：T04([C-MILVUS](#契约锚点表)) · **影响↓**：T08/T09
- **契约**：定义 [C-VECTOR-TOOL](#契约锚点表) · **注意**：reranker 升 8B 后集成断言待复核（见 [G5](#g5)）

### T08 — RAG 路由 + 出处 + 单合同锁定 {#t08}
- **层**：③ 查询 · **状态**：🟢 11 场景 schema 校验 · **端到端待 [G1](#g1)+API key**
- **做什么**：coremind.yaml systemPrompt（三路径路由 + 出处三要素 + 低相似度诚实 + 单合同锁定 + 金额/时间口径）。
- **依赖↑**：T05/T06([C-READONLY](#契约锚点表))/T07([C-VECTOR-TOOL](#契约锚点表)) · **影响↓**：T09/T11

### T09 — S1+S2 eval gate（核心子集 15–20 题） {#t09}
- **层**：③ 查询 · **状态**：⏳ ready-for-agent
- **做什么**：`evals/scenarios.yaml` 补场景；trajectory + response + 出处 + 不幻觉 grader；`coremind eval` 全绿。
- **依赖↑**：T08 + [G1](#g1)(只读串) + [G2](#g2)(真实数据) + DEEPSEEK_API_KEY · **影响↓**：验收 V1/V3/V4
- **非目标**：数值真值比对（G4 延后）

### T10 — Koa 网关 MySQL→PG + CoreMind 代理 {#t10}
- **层**：② 网关 · **状态**：✅（真 PG 三冒烟绿）
- **做什么**：网关迁 PG + `/agent/chat` 代理到 `COREMIND_URL`，透传富格式。
- **依赖↑**：无（运营库独立） · **影响↓**：T11
- **契约**：消费 [C-CHAT](#契约锚点表)

### T11 — 前端 AgentSearch 接真实数据 {#t11}
- **层**：① 前端 · **状态**：⏳ ready-for-agent
- **做什么**：MessageItem 扩 `{content,tableData?,sql?,citations?}`；对接网关 `/api/agent/chat`；SQL 折叠块 + RAG 出处 UI；删 mock。
- **依赖↑**：T10 + [G3](#g3)(/chat wrapper 才有真实端点) · **影响↓**：验收 V2/V3
- **契约**：消费 [C-CHAT](#契约锚点表)

---

## 缺口任务（G-*，本轮新发现，handoff 未写明）

### G1 — 起常驻查询库 + 只读角色 {#g1}
- **层**：④ 环境 · **状态**：✅（2026-08-13 PG16 起在 5433，只读角色实连验证：能读不能写）
- **做什么**：常驻 PG16(端口 5433，避开 5432 的 pg_ip_agent) + migration/seed + `jinguan_readonly` 只读角色（`seeds/002_readonly_role.sql`）。
- **依赖↑**：T01([C-PG-SCHEMA](#契约锚点表)) · **影响↓**：T06/T09 端到端解锁
- **契约**：落地 [C-READONLY](#契约锚点表) 第③道防线

### G2 — 真实合同数据入库 {#g2}
- **层**：⑤ 解析 · **状态**：🟢 单份跳通（QC-2026015：PG 1 合同 + Milvus 248 向量，已 flush）
- **做什么**：`scripts/ingest_real.py` 串 parse→confirm→vectorize；接台账词表；跑真 PDF 入库。
- **依赖↑**：T04 + G1(库) + C-TAXONOMY(词表) · **影响↓**：T09（无数据 eval 查空）
- **契约**：定义 [C-TAXONOMY](#契约锚点表) · **遗留**：模块切段太窄致模块命中恒 0（归 [G4](#g4)）；批量剩 6 份未导

### G3 — CoreMind /chat HTTP wrapper {#g3}
- **层**：③ 查询 · **状态**：⏳ 未做
- **做什么**：用 `CoreMindRuntime`+`ChatSession` 包一个 HTTP `/chat` 端点，供网关 `COREMIND_URL` 指向。**同时升级 vendor 到 0.3.0-rc.2**（最小闭包 4 包，见 [升级评估](../../handoff.md#五点五)）。
- **依赖↑**：T08 · **影响↓**：T11（前端联调前置）
- **契约**：定义 [C-CHAT](#契约锚点表)

### G4 — 模块切段优化 + 数值真值集 {#g4}
- **层**：⑤ 解析 + 测试 · **状态**：⏳ 未做（延后）
- **做什么**：① `_slice_module_text` 改鲁棒（含 AI 词的技术任务书要能进模块段）；② 人工核对已知答案建数值真值快照，收紧 eval 数值断言。
- **依赖↑**：G2(真实数据暴露切段问题) · **影响↓**：R5 模块查询准确性、V1 数值验收

### G5 — reranker 8B 集成断言复核 {#g5}
- **层**：③ 查询 · **状态**：🔴 1 集成测试回归
- **做什么**：`vector_search.integration.test.ts` 的"智能巡检"强断言在 8B 下排序变化（expected 101 得 202）。判断是测试预期需随 8B 调，还是 8B 排序异常，据实修正。
- **依赖↑**：reranker 升 8B（已提交） · **影响↓**：T07 集成绿

---

## 未提交改动（本轮产生，待决定提交）

- `apps/parse-service/src/jinguan_parse/taxonomy.py`（新，词表 loader）
- `apps/parse-service/src/jinguan_parse/{config.py,api.py}`（接词表）
- `apps/parse-service/src/jinguan_parse/vector.py`（加 flush）
- `apps/parse-service/scripts/ingest_real.py`（新，一次性入库脚本）
- `apps/parse-service/requirements.txt`（加 openpyxl）
- `packages/contracts-db/seeds/002_readonly_role.sql`（新，只读角色）
