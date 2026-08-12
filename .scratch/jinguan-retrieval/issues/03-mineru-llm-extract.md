# 03 — MinerU 解析 + LLM 分组抽取(20 AI 字段)

**What to build:** 合同 PDF → MinerU → MD 全文 → LLM structured output + Pydantic 按 6 大类分组抽取 20 个 AI 字段 + 四模块原文单独抽；模块切分(章节锚点+AI 容忍变体)+ 段内精确子串匹配 60 词 → `mod_*_ai/kw/cat`；端到端产出一条草稿区记录，字段可回溯。

**Blocked by:** T01(表在才能写草稿)、T02(接缝保证切分正确)

**Status:** ✅ done（2026-08-12 · 真端到端冒烟过 + 落库过 · pytest 18/18 绿）· **AFK**

> **已落地**：`config.py` · `clients.py`(HttpMineruClient + DeepSeekExtractClient) · `schema.py`(17 标量 AI 字段) · `keywords.py`(pyahocorasick) · `extract.py`(编排接缝→DraftContract) · `persist.py`(落库 adapter→contracts_draft)。
> **开源选型(评测确认)**：openai+instructor / pyahocorasick / httpx / pydantic-settings / psycopg3；切分保留手写。
> **真端到端冒烟过**：`demo/兴晟泽合同.pdf` → MinerU(pipeline, 28.5k 字, 117s) → DeepSeek(JSON 模式, 23s) → 17 字段抽取合理(客户/合同名/类型=框架/金额=20.73万元/仲裁条款/授权人)。
> **落库过**：真 PG(Docker) 集成测试，草稿行 round-trip + 模块命中 JSONB + tag_ai 汇总 + DATE/DECIMAL 主列 NULL/原文入 _ai_raw。
>
> **冒烟发现的真实契约细节(已修)**：
> 1. MinerU 字段是 `files`(数组)非 `file`；`backend`/`return_md` 是 form 字段。已按 OpenAPI 修正 client。
> 2. **`.env` 里 `MINERU_BACKEND=vlm-http-client` 需额外 `server_url`(openai 兼容 VLM 服务地址，你未提供)**；冒烟用 `pipeline`(自包含、无幻觉)跑通。→ **要用 vlm-http-client 需你补 VLM server_url**，否则默认 pipeline 亦可。
> 3. `deepseek-v4-flash` 是 **thinking 模式**，不支持 tool_choice → instructor 改用 `Mode.JSON`(已修)。
>
> **真值对照(2026-08-12, HJ-2024055 ↔ 台账第7行)**：pipeline+v4-pro，可比 13 字段命中 10(77%)。完全对 7(客户/签约主体=乙方/类型/签约日期/金额 31522732.8✓/上限口径/税率 6%=0.06)；长文本核心一致 3。**2 处"错"实为 pipeline OCR 上游问题**：① 客方合同号 CMIOT→OCR 成 CMI0T(O→0)，模型保守不填；② 2026 起止日期段整段漏 OCR。抽取逻辑本身正确。→ VLM 备选判据见记忆。
>
> **本单剩余(归 T04)**：日期/金额规整(需真值样本 G4)、批处理/指纹去重、核对入正式库时展开 contract_module_hits、建向量。

> ⚠️ **ADR-0004（模块配置驱动）**：模块级命中不再写 `contracts.mod_*` 宽列，改写 `contract_module_hits`（每合同×每模块一行：hit/keywords/category/raw_text/raw_text_ai_raw）。模块清单与锚点变体从 `contract_modules` 配置表读（种子已含 4 模块），**不再是代码常量**。抽取时 mod 段落归属靠 `contract_modules.anchor_names`。
>
> **G3 已收窄**：四模块「对应合同内模块名称」初始清单已取自原型并写入种子；本单从 AFK 化——除非要新增/调整模块（那是运营在配置页维护）。

## 九维度

- **功能范围**：MinerU 调用；Pydantic 6 大类分组抽取 20 AI 字段；四模块原文单独抽；段内 60 词精确匹配 → mod_*；汇总 tag_ai。
- **非目标**：6 手工列不抽(留 NULL)；不核对入正式库(→T04)；不建向量。
- **用户/系统流程**：投一份 PDF → MinerU → LLM 抽取 → 写 `contracts_draft` 一行(confirmed=0)，字段可回溯。
- **数据与状态变化**：新增 draft 行；AI 候选写 `<field>_ai_raw` 留痕；不触及正式库。
- **接口/模块边界**：复用 T02 接缝；MinerU/LLM 端点封在解析侧。
- **权限与安全**：草稿区不背书数据，查询侧永不读；仅写 draft。
- **失败处理**：解析/抽取失败 → 标记待人工，不阻断整批(沿用 §8)。
- **兼容性**：字段名对齐 T01 DDL；模块类目对齐 T05 schema 语义。
- **可观察性 · 🟡 HITL 依赖**：**需 G3：四模块「对应合同内模块名称」初始清单**(章节锚点变体)方可实现切分；未提供前实现被卡。

## 验收标准（可观测）

- [ ] 一份 demo PDF 跑通 → `contracts_draft` 出现一行，20 AI 字段有值、6 手工列为 NULL
- [ ] 四模块各产出 `mod_*_ai`(0/1) + `mod_*_kw` + `mod_*_cat`；`tag_ai` = 四模块 OR 汇总正确
- [ ] 每个 AI 字段值可回溯到 `<field>_ai_raw` 原始候选
- [ ] 模块切分对锚点变体(「服务内容」≈「项目范围」「服务标的」)命中，用例可验
- [ ] MinerU 调用 `POST /file_parse`(backend=vlm-http-client, timeout≥300s)可用

## 验证方法

```bash
python parse.py demo/兴晟泽合同.pdf --draft
psql "$PG_URL" -c "SELECT tag_ai, mod_service_ai, service_content_ai_raw \
                   FROM contracts_draft ORDER BY id DESC LIMIT 1"
```

## 完成定义

一份 demo PDF 端到端产出 draft 行；20 AI 字段+四模块 mod_* 齐全且可回溯 `_ai_raw`；tag_ai 汇总正确；手工列留 NULL；模块锚点变体命中用例绿。**前置：G3 清单已提供。**
