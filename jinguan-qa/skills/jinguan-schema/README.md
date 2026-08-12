# 经小管合同库 · 数据字典（生成只读 SQL 的唯一依据）

> 本文件全文注入 Agent 系统提示词，是 `sql_query` 写 SQL 的**唯一权威 schema**。
> 完整度 = 系统能覆盖的提问范围。DDL 每次加列/改语义，必须同步更新此文件并在
> `evals/scenarios.yaml` 增对应场景。
>
> **本字典只声明列的含义**。用户自然语言 → 用哪些列/怎么过滤，由你（Agent）依据这些
> 列语义**自行推理**。这里**不提供**「用户说法 → 固定过滤条件」的映射表——语言表达无穷，
> 靠推理而非查表（ADR-0002）。

---

## 零、库与只读纪律

- 库 = PostgreSQL。查询侧**只读** `contracts` / `contract_modules` / `contract_module_hits` / `contract_chunks` 四张查询表（草稿表 `contracts_draft` 是解析中间态，**永不读**）。
- 只生成**单条 SELECT**；禁止 INSERT/UPDATE/DELETE/DDL/多语句（`assertReadOnly` 会真解析拦截）。
- 只引用下列**已声明的列**，不得臆造列名。

---

## 一、contracts —— 合同主表（查询主入口）

正式库每行是一份已人工核对的合同。**只有以下「查询可用列」可用于过滤/分组/SELECT**；
表里还有手工列、系统列、AI 留痕列、核对列，**均不用于查询**（见 §五）。

### 1.1 概要信息（可过滤 / 可展示）

| 列名 | 类型 | 含义 | 说明 |
|---|---|---|---|
| `id` | BIGINT | 主键 | JOIN `contract_module_hits`/`contract_chunks` 的连接键 |
| `contract_no` | TEXT | 我方合同号 | 唯一键，出处标注用 |
| `contract_name` | TEXT | 合同名称 | |
| `customer_name` | TEXT | 甲方/客户名称 | 多客户全列在一格，模糊匹配用 `LIKE` |
| `signing_entity` | TEXT | 我方签约主体 | |
| `contract_type` | TEXT | 合同类型（枚举） | 取值：`框架` / `单项` / `补充` / `解除` / `变更协议` |
| `customer_contract_no` | TEXT | 客方合同号 | |

### 1.2 时间列（原始日期 + 物化列）

原始日期列用于精确区间；物化列用于「年/季/半年」这类语义时间——**优先用物化列**，
避免自己对 date 做 `EXTRACT`（物化列已建索引，且语义已固定）。

| 列名 | 类型 | 含义 | 语义 |
|---|---|---|---|
| `sign_date` | DATE | 签订日期 | 精确区间/排序用 |
| `start_date` | DATE | 合同开始日期 | |
| `end_date` | DATE | 合同结束日期 | 到期/断档判断 |
| `sign_year` | INT | 签订年份 | `sign_year = 2026` = 2026 年签订 |
| `sign_quarter` | INT | 签订季度 | 1–4；`sign_quarter = 3` = 第三季度 |
| `sign_half` | INT | 签订半年 | **`1` = 上半年（含 Q1、Q2）；`2` = 下半年（含 Q3、Q4）** |
| `end_year` | INT | 结束年份 | 供到期/断档统计 |

> 语义时间推理由你完成：例如「上半年」→ `sign_half = 1`；「前两季度」→ `sign_half = 1`；
> 「去年」→ `sign_year =（当年 − 1）`。**未指定年份时**默认按当年过滤，并在答案末尾加一行
> 假设声明（如 `> 假设：未指定年份，按 2026 年统计。`）。当年取值以对话上下文中的当前日期为准。

### 1.3 金额与结算（口径纪律，ADR-0002）

| 列名 | 类型 | 含义 | 口径 |
|---|---|---|---|
| `amount` | DECIMAL | 合同金额（元） | **可空**——框架协议常无金额（NULL）；`SUM(amount)` 必须带 `WHERE amount IS NOT NULL` |
| `amount_type` | TEXT | 金额口径（枚举） | 取值：`上限` / `预估` / `固定`。**不同口径不可隐式合一** |
| `tax_rate` | TEXT | 税率 | **TEXT，非数值**（多税率全列出，如「6%,9%」）；**不可做算术运算**，仅展示/存在性 |

**金额求和硬规则**：
- 只要涉及 `SUM(amount)`，一律 `WHERE amount IS NOT NULL`（无金额是合法类别，不能当 0）。
- 结果集若混含多种 `amount_type`，**分口径 `GROUP BY amount_type` 分行求和并标注**，禁止把上限/预估/固定加成一个总数。

### 1.4 商务条款（多为长文本 → 存在性过滤）

| 列名 | 类型 | 含义 | 用法 |
|---|---|---|---|
| `post_eval` | TEXT | 是否售后评价 | 短枚举「是/否」，可等值过滤 |
| `deposit_amount` | DECIMAL | 履约保证金金额 | 可空，可数值过滤/求和（同 `amount` 的 NULL 纪律） |
| `authorizer` | TEXT | 授权人 | 可等值/模糊 |
| `settlement_terms` | TEXT | 结算条款 | **长文本**：仅 `IS NOT NULL` / `LIKE` 存在性过滤，**不 SELECT 全文回灌**；要原文走 RAG(`vector_search`) |
| `deposit_refund` | TEXT | 保证金退还条件 | **长文本**：同上，仅存在性过滤 |
| `arbitration` | TEXT | 仲裁方式 | **长文本**：同上，仅存在性过滤 |

> 长文本列（`settlement_terms`/`deposit_refund`/`arbitration`）**不进 SELECT 列表**，也不做全文比对。
> 「结算条款是怎么写的 / 仲裁怎么约定的」这类**要原文**的问题 → 用 `vector_search` 走 RAG，不用 SQL。

### 1.5 合同级 AI 标签

| 列名 | 类型 | 含义 |
|---|---|---|
| `tag_ai` | INT | **合同级**汇总标记：四模块任一命中 AI 关键词即 `1`，否则 `0` |

> `tag_ai` 是**合同级粗粒度**（这份合同是否沾 AI）。要问「哪个**模块**含 AI」这种**细粒度**，
> 不看 `tag_ai`，要 JOIN `contract_module_hits`（见 §三）。二者是「汇总 vs 细粒度」，不可混用。

---

## 二、contract_modules —— 模块配置表（可新增，ADR-0004）

模块**不是** contracts 上的固定列，而是**配置驱动**：原型「合同模块」页可新增模块，
新增即此表插一行，**永不 ALTER contracts**。

| 列名 | 类型 | 含义 |
|---|---|---|
| `module_key` | TEXT (PK) | 稳定标识，查询用（预置：`service`/`tech`/`role`/`staff`） |
| `name` | TEXT | 展示名（服务内容/技术要求/岗位说明/人员需求） |
| `anchor_names` | TEXT[] | 对应合同内模块章节名变体（解析侧归类用，查询一般不碰） |
| `enabled` | BOOLEAN | 是否启用 |

预置四模块：`service`=服务内容、`tech`=技术要求、`role`=岗位说明、`staff`=人员需求。
（新模块随时可增，查询时如需模块名可 JOIN 此表取 `name`。）

---

## 三、contract_module_hits —— 模块命中明细（模块过滤走这里，不是宽列）

**每合同 × 每模块一行**。这是「某模块是否命中 AI 关键词」的细粒度数据来源。
**模块过滤 = JOIN 本表**，绝不存在 `mod_service_ai` 之类的 contracts 宽列。

| 列名 | 类型 | 含义 |
|---|---|---|
| `contract_id` | BIGINT | 关联 `contracts.id` |
| `module_key` | TEXT | 关联 `contract_modules.module_key`（service/tech/role/staff/…） |
| `hit` | INT | 该模块是否命中 AI 关键词 `0/1` |
| `keywords` | TEXT | 命中的具体关键词（逗号分隔） |
| `category` | TEXT | 命中词所属 AI 大方向（取值见 §四） |
| `raw_text` | TEXT | **长文本**：该模块原文——仅存在性过滤，要原文走 RAG |

### 模块过滤的标准 JOIN 口径

「服务内容含 AI」= 该合同 `service` 模块命中：

```sql
SELECT c.contract_no, c.contract_name
FROM contracts c
JOIN contract_module_hits h ON h.contract_id = c.id
WHERE h.module_key = 'service' AND h.hit = 1;
```

「服务内容含 AI 但技术要求未提」= 一命中、一未命中，用两次 JOIN（或 EXISTS / NOT EXISTS）：

```sql
SELECT c.contract_no
FROM contracts c
WHERE EXISTS (SELECT 1 FROM contract_module_hits h
              WHERE h.contract_id = c.id AND h.module_key = 'service' AND h.hit = 1)
  AND NOT EXISTS (SELECT 1 FROM contract_module_hits h
                  WHERE h.contract_id = c.id AND h.module_key = 'tech' AND h.hit = 1);
```

> 记住区分：`contracts.tag_ai=1` = **整份**合同沾 AI（汇总）；
> `contract_module_hits.hit=1 AND module_key='service'` = **服务内容这一模块**命中（细粒度）。

---

## 四、AI 大方向取值（`category` / 命中词分类）

`contract_module_hits.category` 的取值域（§6.2 词表 10 大方向）：

`大模型与生成式AI` · `机器学习` · `计算机视觉` · `自然语言处理` · `语音技术` ·
`知识图谱` · `智能运维AIOps` · `数据智能` · `智能巡检` · `边缘智能`

问「涉及计算机视觉的合同」这类**指定大方向** → `... WHERE h.category = '计算机视觉' AND h.hit = 1`。

---

## 五、查询不可用的列（勿引用）

以下列存在于表里但**不用于查询**，SELECT/过滤都不要碰：

- **手工列**（人工填，非 AI 抽取，查询无稳定语义）：`assessment_line`、`bid_no`、`related_main_no`、`framework_alias`、`status`。
- **系统列**：`expiry_warning`（系统按到期时间自动算的推送文案，非查询维度）。
- **AI 留痕列** `*_ai_raw`（如 `amount_ai_raw`）：审计用的 AI 原始候选文本，非结构化值。
- **核对列**：`confirmed`（正式库恒为 1）、`confirmed_by`、`confirmed_at`。

> 需要「哪些合同状态是已签约」这类基于手工列的查询时——首版不支持（手工列语义不稳定），
> 应向用户说明，而非臆造过滤。

---

## 六、contract_chunks —— 片段表（RAG 侧，SQL 一般不查）

原文片段 + metadata（`contract_id`/`contract_no`/`field`/`module_category`/`content`），
是 `vector_search`（RAG）的落地表，**结构化统计不查它**。列在此仅为 schema 完整性。

---

## 七、示范解法（也是评测基线）

1. **「服务内容包含 AI 的合同有多少，给出编号和总金额」**
   → JOIN `contract_module_hits`（`module_key='service' AND hit=1`）；`COUNT` + 编号列表 + `SUM(amount) WHERE amount IS NOT NULL`；若混口径则分 `amount_type` 分行。

2. **「2026 年签订的框架合同有哪些」**
   → `WHERE sign_year = 2026 AND contract_type = '框架'`，SELECT `contract_no, contract_name`。

3. **「上半年签订、金额上限口径的合同总额」**
   → `WHERE sign_half = 1 AND amount_type = '上限' AND amount IS NOT NULL`，`SUM(amount)`。

4. **要原文的问题**（如「XX 合同结算条款怎么写的」「有没有和这份类似的合同」）
   → **不写 SQL**，走 `vector_search`（RAG）。长文本原文永远从向量库取，不从 SQL 回灌。
