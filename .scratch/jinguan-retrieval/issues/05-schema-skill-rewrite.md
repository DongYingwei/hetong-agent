# 05 — Schema skill 重写(台账字段 + 列语义 + 配置驱动模块)

**What to build:** `jinguan-schema` 数据字典对齐 PG 实际 schema（**5 表**：contracts 25 非模块台账列 + `contract_modules`(配置) + `contract_module_hits`(模块命中明细) + contracts_draft + contract_chunks）：列出查询可用子集（结构化字段 + 物化时间列 + `amount_type`/`tax_rate` + `tag_ai` 合同级汇总）；**模块过滤声明为 JOIN 明细表**（不是 `mod_*_ai` 宽列）；长文本列标注「仅存在性过滤(IS NOT NULL/LIKE)，不 SELECT 全文回灌」；物化列声明列语义（**不做固定映射表**）；删除旧 `tag_5g/industry` 冗余与「严禁自行推理」矛盾表述。

**Blocked by:** T01(PG 表在才能对照写 schema)

**Status:** ready-for-agent · **AFK**（据 T01 DDL 派生）

> ⚠️ **ADR-0004（模块配置驱动）**：模块过滤法**不是** `contracts.mod_service_ai=1` 列，而是 JOIN 明细表：`contract_module_hits WHERE module_key='service' AND hit=1`。schema skill 须声明 `contract_modules`（配置：module_key/name/anchor_names/enabled）与 `contract_module_hits`（明细：hit/keywords/category/raw_text）的 JOIN 口径，并同步更新 CONTEXT.md 术语（`mod_*_ai` 列 → 明细表）。本单文案里旧的 `mod_*_ai/kw/cat` 宽列表述以此为准改写。

## 九维度

- **功能范围**：查询可用列清单(对照 DDL)；**模块 JOIN 明细表口径**(contract_modules 配置 + contract_module_hits 明细，非宽列)；金额口径规则；物化列语义声明；长文本仅存在性过滤；排除手工/系统列。
- **非目标**：不改工具代码(→T06)；不写「说法→条件」固定映射表(ADR-0002)；不涉及向量。
- **用户/系统流程**：skill 全文注入 systemPrompt → Agent 据列语义自行推理生成 SQL。
- **数据与状态变化**：纯文档；无运行时状态。
- **接口/模块边界**：skill 完整度 = 系统可覆盖提问范围；DDL 变更须同步此 skill + 增 eval。
- **权限与安全**：声明长文本列**不 SELECT 全文回灌**，仅 IS NOT NULL/LIKE 存在性过滤。
- **失败处理**：列名遗漏/臆造 → 对应提问失败，靠 T09 eval 兜底暴露。
- **兼容性 · 坑2**：删除旧映射表与「严禁自行推理」(与 ADR-0002 矛盾)；列名对齐 T01。
- **可观察性**：skill 列清单可逐条比对 `\d contracts`；不遗漏不臆造。

## 验收标准（可观测）

- [ ] skill 列清单与 T01 DDL 查询可用列**逐一对齐**，无遗漏、无表外列
- [ ] **模块过滤声明为 JOIN**：`... JOIN contract_module_hits h ON h.contract_id=c.id WHERE h.module_key='service' AND h.hit=1`——skill 明确此口径，**不出现 `mod_service_ai` 等宽列**
- [ ] 声明 `contract_modules`(module_key/name/anchor_names/enabled，可新增) 与 `contract_module_hits`(hit/keywords/category/raw_text) 两表关系
- [ ] 含 `amount_type`/`tax_rate`、`tag_ai` 合同级汇总、物化时间列语义(`sign_half=1`=上半年)
- [ ] 长文本列显式标注「仅存在性过滤」；手工/系统列被排除
- [ ] 旧 `tag_5g/industry` 冗余、`mod_*_ai` 宽列、「严禁自行推理」表述**已删除**(grep 无残留)
- [ ] Markdown 格式，可被 CoreMind skill inject 到 systemPrompt

## 验证方法

```bash
# 对照实际 schema 列名 vs skill 提及列（模块列已不在 contracts）
diff <(psql -c "\d contracts" | awk '...') \
     <(grep -oE 'sign_[a-z]+|amount_type|module_key' skills/jinguan-schema/README.md | sort -u)
# 确认无旧宽列/矛盾表述残留
grep -iE "严禁自行推理|tag_5g|mod_service_ai|mod_tech_ai" skills/jinguan-schema/README.md   # 期望无输出
grep -c "contract_module_hits" skills/jinguan-schema/README.md   # 期望 ≥1（声明了 JOIN 口径）
```

## 完成定义

schema skill 与实际 5 表 schema 对齐；模块过滤声明为 JOIN 明细表（无 mod_* 宽列）；金额口径/物化列语义/长文本存在性过滤声明齐全；旧映射表与「严禁自行推理」清除；可被 inject。
