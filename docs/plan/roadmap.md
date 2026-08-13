# 分期计划 · 经小管合同智能体

> 三层规划文档之一。**分期层**回答"分几步、什么顺序、每步目标"。
> 关联：[需求 requirements.md](./requirements.md) · [任务分解 tasks.md](./tasks.md)
> 最后更新：2026-08-13 · 状态：**草案，P0/P1 目标定位待用户拍板**（见 §0）。

---

## 0. 分期目标定位（由 AI 总体拆分，2026-08-13）

三阶段，逐层收敛：**先接通 → 再达标 → 后完善**。

| 阶段 | 目标 | 完成的一句话标志 |
|---|---|---|
| **P0 打通链路** | 前端→网关→CoreMind→真库 能真实问答一次 | 前端问一句合同，答案真实来自库、带出处 |
| **P1 质量达标** | 查询准确率经得起首版 gate | `coremind eval` 核心子集全绿 + 模块查询命中准 |
| **P2 完善交付** | 全量题库 + 数值可比对 + 调参 | 50+20 题库含数值真值全绿 |

**分期理由**：主骨（schema/解析/两工具/网关）已完成，剩下是"接通+验证+补数据"。先打通能尽早暴露联调问题（如 CoreMind wrapper、富格式契约）；质量和数值真值依赖人工核对（G4），成本高，放后。

**每阶段都必须有可执行的完成判定**（下方各阶段"✅ 判定"列），跑绿才算完成，不靠主观判断。

---

## 1. 现状基线（进度快照 2026-08-13）

| 层 | 已完成 | 待办 |
|---|---|---|
| ④ 契约 | [T01](./tasks.md#t01) ✅ · [G1](./tasks.md#g1) ✅(库+只读角色) | — |
| ⑤ 解析 | [T02](./tasks.md#t02)[T03](./tasks.md#t03)[T04](./tasks.md#t04) ✅ · [G2](./tasks.md#g2) 🟢(单份跳通) | G2 批量 · [G4](./tasks.md#g4) 切段/真值 |
| ③ 查询 | [T05](./tasks.md#t05)[T07](./tasks.md#t07) ✅ · [T06](./tasks.md#t06)[T08](./tasks.md#t08) 🟢 | [T09](./tasks.md#t09) · [G3](./tasks.md#g3) wrapper · [G5](./tasks.md#g5) rerank |
| ② 网关 | [T10](./tasks.md#t10) ✅ | — |
| ① 前端 | — | [T11](./tasks.md#t11) |

**核心洞察**：主骨（schema/解析/两工具/网关）已成，**剩下的都是"接通 + 验证 + 补数据"**，无从零构建的大件。

---

## 2. P0 — 打通链路（端到端可演示）

> **阶段目标**：一个用户在前端问"服务内容含 AI 的合同有哪些"，答案真实来自库、带出处。
> **满足需求**：R1-R4 端到端可见；V1(轨迹)/V2(出处)/V3(路由)/V4(不幻觉) 首版达标。

| 步骤 | 任务 | 产出物 | ✅ 完成判定（可执行） |
|---|---|---|---|
| **P0-1** | [G5](./tasks.md#g5) | reranker 8B 下集成测试修正 | `cd apps/query-agent && npx vitest run` → **28 绿**（当前 27 绿 1 红） |
| **P0-2** | [G2](./tasks.md#g2) | 真实合同入库（≥1 份，现 QC 已入） | 只读账号查 `SELECT count(*) FROM contracts ≥1` + Milvus `num_entities ≥1`（脚本见下 §7） |
| **P0-3** | [G3](./tasks.md#g3) | `/chat` HTTP 服务 + vendor 升 rc.2 | `curl -X POST localhost:<port>/chat -d '{"message":"...","history":[]}'` → 返回含 `content` 字段的 JSON（[C-CHAT](./tasks.md#契约锚点表)） |
| **P0-4** | [T09](./tasks.md#t09) | eval 核心子集场景 | `cd apps/query-agent && coremind eval coremind.yaml` → **核心子集通过率 100%**（≥15 题；数值项标 skip） |
| **P0-5** | [T11](./tasks.md#t11) | 前端接真实数据 UI | 前端手动冒烟：发问 → 回显真实答案 + SQL 折叠块/出处（**无自动化测试，人工截图为证**） |

**阶段 ✅ 判定（全绿才算 P0 完成）**：
1. `npx vitest run`（查询侧 28 绿）
2. `pytest`（解析侧 40 绿，确保入库改动没回归）
3. `coremind eval`（核心子集 100%）
4. 前端一条真实问答链路截图（人工）

---

## 3. P1 — 质量达标（模块命中准 + 首版 gate 稳）

> **阶段目标**：查询准确率经得起首版 gate，模块化查询（R5）命中准确。
> **满足需求**：R5 模块查询准确；V3 路由全覆盖。

| 步骤 | 任务 | 产出物 | ✅ 完成判定（可执行） |
|---|---|---|---|
| **P1-1** | [G4](./tasks.md#g4)a | `_slice_module_text` 改鲁棒 | 新增 pytest：对 QC-2026015 markdown，service/tech 段能切出含 AI 词的内容 → 模块命中 hit=1 |
| **P1-2** | [G2](./tasks.md#g2) 全量 | 全部测试合同入库 | 只读账号 `SELECT count(*) FROM contracts = <全部份数>`；`contract_module_hits` 有 hit=1 行 |
| **P1-3** | 网关冒烟脚本 | `apps/gateway` 自动化冒烟（补测试缺口） | `node scripts/smoke.js` → 登录/CRUD/agent 代理三绿 |
| **P1-4** | [T09](./tasks.md#t09) 扩 | eval 核心子集扩到覆盖 R1-R5 全路径 | `coremind eval` 通过率 ≥0.9（`minScenarioPassRate` 已设）；含模块查询题 |

**阶段 ✅ 判定**：`coremind eval` ≥0.9 + 新增切段 pytest 绿 + 网关冒烟绿 + 模块查询题在 eval 中通过。

---

## 4. P2 — 完善交付（全量题库 + 数值真值 + 调参）

> **阶段目标**：50+20 全量题库含数值比对，达生产交付标准。**依赖人工核对（G4b），成本高，放最后。**
> **满足需求**：V1 数值验收达标；V5 同步正确性。

| 步骤 | 任务 | 产出物 | ✅ 完成判定（可执行） |
|---|---|---|---|
| **P2-1** | [G4](./tasks.md#g4)b | 人工核对已知答案 → 数值真值快照 | `data/` 下有真值快照文件（人工核对产出） |
| **P2-2** | [T09](./tasks.md#t09) 全量 | 50 定量 + 20 定性题库 | `coremind eval` 全量题库通过率 ≥0.9，**含数值真值比对**（response grader equals/contains 真值） |
| **P2-3** | 调参 | top_k/top_n/相似度阈值基线 | 有评测对照数据；调参后 eval 通过率不降 |
| **P2-4** | [G2](./tasks.md#g2) 同步验证 | 片段同步（标签/原文更新）端到端 | 改标签→`/sync`→只读查 metadata 与正式库一致（V5） |

**阶段 ✅ 判定**：全量题库 eval ≥0.9 含数值比对 + 同步一致性验证通过。

---

## 5. 阶段依赖流（一图看顺序）

```
P0-1(rerank修) ─┐
P0-2(数据≥1份) ─┼─▶ P0-4(eval核心) ─▶ P1-4(eval扩) ─▶ P2-2(eval全量)
P0-3(wrapper) ──┴─▶ P0-5(前端)                          ▲
                                    P1-1(切段)─P1-2(全量数据)─P2-1(真值)┘
```
**关键路径**：P0-3(wrapper) → P0-5(前端联调)；P1-1(切段) → P1-2(重导数据) → P2-1(真值) → P2-2(数值 eval)。

---

## 6. 变更影响追溯（总控）

改动任一环时，**先查 [tasks.md 契约锚点表](./tasks.md#契约锚点表)**，顺"影响任务"列评估波及面。典型链：

- 改 **C-PG-SCHEMA**（加列/改约束）→ 波及 T03/T04/T05/T06/G1/G2 → 需重跑解析入库 + 改 schema skill + 复验只读角色。
- 改 **C-MILVUS**（metadata/维度）→ 波及 T07/G2 → 需重建向量 + 改召回过滤。
- 改 **C-CHAT**（/chat 返回结构）→ 波及 T10/T11 → 网关透传 + 前端 UI 同步改。
- 改 **C-TAXONOMY**（词表）→ 波及 G2 模块命中 → 需重跑入库。

---

## 7. 用户控制的门（gate）

| 门 | 缺什么 | 卡住 | 状态 |
|---|---|---|---|
| G1 | PG 只读角色连接串 | T06/T09 | ✅ 已建（5433 + jinguan_readonly） |
| API key | DEEPSEEK_API_KEY | T09 eval | ✅ 已配 |
| G4 | 数值真值（人工核对） | P2 数值断言 | ⏳ P2 阶段 |

---

## 8. 完成判定命令速查（各层测试）

> 每阶段的 "✅ 完成判定" 用的命令集中在此，可复制执行。

**④ 契约层**
```bash
bash packages/contracts-db/tests/verify.sh          # 11 断言（临时 PG）
```

**⑤ 解析层**
```bash
cd apps/parse-service && python3 -m pytest tests/    # 40 test（含真 PG/Milvus 集成）
```

**③ 查询层**
```bash
cd apps/query-agent && npx vitest run                # 28 test（含真 embed/Milvus/rerank 集成）
cd apps/query-agent && coremind eval coremind.yaml   # eval 场景通过率（minScenarioPassRate=0.9）
```

**② 网关层**（P1-3 补冒烟脚本前，只能手动）
```bash
# 现状无自动化；P1-3 产出 node scripts/smoke.js（登录/CRUD/agent 代理三绿）
```

**① 前端层**（无自动化，人工验证）
```bash
cd apps/web && npm run dev    # 手动发问，截图验证真实答案 + SQL 折叠 + 出处 UI
```

**数据入库验证（P0-2 判定）**
```bash
# 只读账号能查到数据
python3 -c "import psycopg;from dotenv import dotenv_values;\
c=psycopg.connect(dotenv_values('apps/query-agent/.env')['PG_READONLY_URL']);\
print('contracts:',c.execute('SELECT count(*) FROM contracts').fetchone()[0])"
# Milvus 向量数（需 flush 后）
python3 -c "from pymilvus import MilvusClient;\
print(MilvusClient(uri='http://localhost:19530').get_collection_stats('contract_chunks'))"
```

---

## 9. 测试覆盖现状与缺口（诚实标注）

| 层 | 自动化测试 | 缺口 |
|---|---|---|
| ④ 契约 | verify.sh 11 断言 | 无 |
| ⑤ 解析 | pytest 40（fake + 真集成） | 切段鲁棒性测试待补（P1-1） |
| ③ 查询 | vitest 28 + coremind eval | eval 数值真值待建（P2） |
| ② 网关 | **无** | 冒烟脚本待补（P1-3） |
| ① 前端 | **无** | 首版靠人工；E2E（Playwright）可选，非首版 |

> ⚠️ 网关/前端首版无自动化测试，其"完成判定"依赖冒烟脚本 + 人工验证，不可与解析/查询层的严格断言等同。这是首版的已知取舍，非疏漏。
