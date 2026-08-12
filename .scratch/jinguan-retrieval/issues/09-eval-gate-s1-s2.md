# 09 — S1+S2 eval gate(核心子集约 15–20 题)

**What to build:** `evals/scenarios.yaml` 补语义检索场景；断言：trajectory(路由+串行+forbiddenTools) + outcome + SQL 语法/口径正确 + 出处完整性 + 不幻觉抽检。首版 gate 全绿即达标；**不含数值真值比对**(随测试库 G4 后续建立)。

**Blocked by:** T08(Agent 端到端通)

**Status:** ready-for-agent · **AFK**（非数值子集；数值真值 G4 延后）

## 九维度

- **功能范围**：补齐 15–20 题核心子集：标准三问 + 时间×标签×module 组合 10–12 + 语义 3–5；trajectory/response grader。
- **非目标**：**不做数值真值比对**与 50/20 全量题库(需 G4 快照真值，用户提供)。
- **用户/系统流程**：`coremind eval` 跑核心子集 → 全绿即 >90% 准确率证据基线。
- **数据与状态变化**：纯测试；断言路由与输出形态，不比对具体数字。
- **接口/模块边界**：复用唯一黑盒接缝 `coremind eval`；只测外部行为不测实现。
- **权限与安全**：越界/非合同问题场景断言诚实拒答、零工具调用(承接现有 out-of-scope 场景)。
- **失败处理**：首版 gate 全绿；不阻塞里程碑(数值真值后续补)。
- **兼容性**：承接现有 `scenarios.yaml` 的 trajectory/response grader 结构(forbiddenTools/sequence)。
- **可观察性**：`coremind eval` 通过率 = 硬信号；`minScenarioPassRate` 已设 0.9。

## 验收标准（可观测）

- [ ] 标准三问 + 组合维度题 → trajectory 纯统计只调 sql_query(forbiddenTools 命中)
- [ ] 语义题 3–5 → trajectory 走 vector_search+sql_query 串行 或 纯 RAG
- [ ] 出处完整性 grader：response 含合同号+字段+原文引用；不幻觉抽检含「未找到」
- [ ] `coremind eval` 首版核心子集全绿(≥15 题)
- [ ] 越界/非合同场景零工具调用、诚实拒答

## 验证方法

```bash
coremind eval coremind.yaml
# 期望：核心子集通过率 100%（数值真值项标记 skip/后续）
```

## 完成定义

核心子集 ≥15 题覆盖统计/组合/语义/越界；trajectory+response+出处+不幻觉 grader 就位；`coremind eval` 首版全绿；数值真值项显式标注延后(G4)。
