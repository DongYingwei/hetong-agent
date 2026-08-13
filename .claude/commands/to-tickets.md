---
description: 把计划/规格/当前对话拆成 tracer-bullet 垂直切片工单(带阻塞依赖),发到配置的 issue tracker
argument-hint: [可选:规格路径/约束说明]
---

阅读并严格按照 `.agents/skills/to-tickets/SKILL.md` 的方法执行:把计划、规格或当前对话拆成一组 tracer-bullet 垂直切片工单,每个工单声明它被哪些工单**阻塞**,发布到项目配置的 issue tracker(见 `docs/agents/issue-tracker.md`——本项目是本地 markdown,写到 `.scratch/<feature>/` 下,每工单一个 md 文件,阻塞边以文本记录)。

先读 `docs/agents/issue-tracker.md` 和 `docs/agents/triage-labels.md` 确认 tracker 与标签约定;若缺失,提示用户先跑 setup-matt-pocock-skills。

复用当前对话已有的上下文(不要重新从零探索);已完成的部分标为 done/skip,不重复出工单。

用户补充约束:$ARGUMENTS
