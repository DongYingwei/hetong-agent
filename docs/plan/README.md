# 规划文档 · 三层结构

> 经小管合同智能体的**需求 → 分期 → 任务**三层规划，相互链接、可追溯影响面。

| 层 | 文档 | 回答 | 核心内容 |
|---|---|---|---|
| 需求 | [requirements.md](./requirements.md) | 要什么 / 为什么 | 5 项能力(R1-R5) · 7 条红线(D1-D7) · 5 项验收(V1-V5) · §9 变更区 |
| 分期 | [roadmap.md](./roadmap.md) | 分几步 / 什么顺序 | P0 打通链路 · P1 质量达标 · P2 完善交付 · 每步带"✅完成判定命令" · §6 变更影响追溯 |
| 任务 | [tasks.md](./tasks.md) | 具体做什么 | T01-T11 主骨 + G1-G5 缺口 · **契约锚点表**(总控中枢) |

## 怎么用

- **接新活**：先看 [roadmap](./roadmap.md) 定位在 P0/P1 哪步 → 点进 [tasks](./tasks.md) 看该任务"做什么/依赖↑/影响↓"。
- **改东西前**：查 [tasks 契约锚点表](./tasks.md#契约锚点表)，顺"影响任务"列看会波及谁——这是"改后面不影响前面"的总控。
- **需求变了**：记进 [requirements §9 变更区](./requirements.md#9-需求变更区待用户补充)，回链受影响任务/分期。

## 与其他文档的关系

- [handoff.md](../../handoff.md)：面向新会话的交接（进度/决策/坑），本规划是其"计划视图"。
- `.scratch/jinguan-retrieval/issues/`：11 份工单原文（九维度验收），tasks.md 是其索引+关联层。

## 增量 PRD

- [prd-导出与验收升级.md](./prd-导出与验收升级.md)：2026-08-13 grilling 收敛的**单主题 PRD**（结构化结果导出 + 验收口径升级）。是 [requirements §9 变更 1](./requirements.md#9-需求变更区待用户补充) 的展开,锚定 [ADR-0005](../../apps/query-agent/docs/adr/0005-prompt-level-planning-not-engine-planner.md)。
