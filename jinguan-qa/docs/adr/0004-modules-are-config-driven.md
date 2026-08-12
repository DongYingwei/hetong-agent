# 合同模块改为配置驱动（可新增），模块命中落明细表

原型「合同模块」页（`page-sections`）把模块做成**可管理、可新增**的配置：每个模块含 模块名 + **对应合同内模块名称**（章节锚点变体）+ 识别规则 + 启用状态，顶部有「新增模块」按钮。当前预置 4 个（服务内容/技术要求/岗位说明/人员需求），但模块清单**不是固定的**。

初版 T01 DDL 与 T02 接缝把四模块当成了**硬编码固定列/集合**（`contracts.mod_service/tech/role/staff` + `mod_*_ai/kw/cat` 共 16 宽列；`MODULE_FIELDS` 常量）。这与「可新增模块」冲突——每新增一个模块就要 `ALTER TABLE` 加 12 列并改代码。

## 决策

模块改为**配置驱动**，命中结果落**明细表**：

- **`contract_modules`**（配置，可新增）：`module_key`（稳定标识 service/tech/…）、`name`、`anchor_names[]`（对应合同内模块名称变体，§6.4）、`recognition_rule`、`enabled`、`sort_order`。种子写入当前 4 个（锚点变体取自原型）。
- **`contract_module_hits`**（每合同 × 每模块一行，替代宽列）：`contract_id`、`module_key`、`hit(0/1)`、`keywords`、`category`、`raw_text`（§5.3 26-29 模块原文）、`raw_text_ai_raw`（§7.2 留痕）。唯一键 `(contract_id, module_key)`。
- **`contracts`** 只保留合同级 `tag_ai` 汇总；移除全部 `mod_*` 宽列。
- **T02 接缝** `process_one_contract(..., module_keys)` 从配置读启用模块集合，模块段的 `chunk.field = module_key`；新增模块只需扩 `module_keys`，代码零改动。

## Consequences

- **新增模块 = 配置表插一行 + 明细表自然多一行**，永不 `ALTER contracts`。原型的「新增模块」能力得以保留。
- **查询侧过滤法变化**：`WHERE mod_service_ai=1` → `JOIN contract_module_hits WHERE module_key='service' AND hit=1`。此变化影响**尚未实现**的 T05（schema skill）、T06（sql_query）；须在其中声明明细表 JOIN 口径，并同步 CONTEXT.md 术语（`mod_*_ai` 列 → `contract_module_hits` 明细）。已实现的 T01/T02 已按此落地并验证。
- **§5.3 台账**：29 逻辑字段中 26-29（四模块原文）与 §6.3 模块级结果不再是 `contracts` 固定列，改由 `contract_module_hits` 承载；台账"字段"语义不变，只是存储位置从宽列改为明细行。
- **G3 缺口收窄**：四模块「对应合同内模块名称」初始清单已从原型取得并写入种子；T03 实现时以 `contract_modules.anchor_names` 为准，新增/调整模块由运营在配置页维护，不再是代码常量。
