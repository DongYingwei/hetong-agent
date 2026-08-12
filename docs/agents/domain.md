# Domain docs

本仓库采用 **multi-context**（多上下文）布局，对应 monorepo 中的多个 package。

## 布局

```
/
├── CONTEXT-MAP.md                      ← 根索引，指向每个 context 的 CONTEXT.md
├── docs/adr/                           ← 系统级架构决策（ADR）
└── packages/
    ├── coremind/
    │   ├── CONTEXT.md
    │   └── docs/adr/                   ← 该 context 的局部决策
    ├── coremind-cli/
    ├── coremind-config/
    ├── coremind-protocol/
    ├── coremind-runtime/
    ├── coremind-templates/
    ├── coremind-tools/
    └── coremind-worker/
        └── CONTEXT.md
```

## 消费者规则

- **探索前先读**：根 `CONTEXT-MAP.md`；再读与主题相关的每个 `packages/<pkg>/CONTEXT.md`。
- **ADR**：读与改动区域相关的 ADR。系统级看 `docs/adr/`，package 级看 `packages/<pkg>/docs/adr/`。
- 若上述文件不存在，**静默继续**——不必提示缺失，也不要一上来就建议创建。`/domain-modeling`（经 `/grill-with-docs` 与 `/improve-codebase-architecture` 触发）会在术语或决策真正被确定时惰性创建它们。

## 使用词表的术语

输出中涉及领域概念（issue 标题、重构提案、假设、测试名）时，使用对应 `CONTEXT.md` 中定义的术语，不要漂移到词表明确回避的同义词。

若所需概念尚未进入词表——这是一个信号：要么在发明项目并不使用的语言（应重新考虑），要么存在真实缺口（记录给 `/domain-modeling`）。

## 标记 ADR 冲突

若输出与某条既有 ADR 相矛盾，显式指出，而非静默覆盖：

> _与 ADR-0007（event-sourced orders）矛盾——但值得重新讨论，因为……_
