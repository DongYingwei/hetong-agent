# 经小管合同库 · 数据字典与查询映射（生成查询时严格依据本表）

> 本文件全文会注入到 Agent 的系统提示词。它的完整度 = 系统能覆盖的提问范围。
> 每次数据库加列/改语义，都要同步更新这里，并在 evals/scenarios.yaml 增加对应场景。

## 一、contracts 表结构（sql_query 只能引用以下列，不得臆造）

| 列名 | 类型 | 含义 | 取值 / 说明 |
|---|---|---|---|
| `contract_no` | TEXT | 合同编号 | 唯一，如 HT-2026-0034 |
| `contract_name` | TEXT | 合同名称 | |
| `amount` | DECIMAL | 合同金额 | 单位：元 |
| `sign_date` | DATE | 签订日期 | 原始日期，保底 |
| `sign_year` | INT | 签订年份 | 用于“2026 年签订” |
| `sign_quarter` | INT | 季度 | 1–4，ETL 入库时物化 |
| `sign_half` | INT | 半年 | 1=上半年, 2=下半年 |
| `contract_type` | TEXT | 合同类型 | 见下方枚举 |
| `industry` | TEXT | 行业 | 见下方枚举 |
| `tag_ai` | INT | AI 标签 | 1=服务内容含 AI（人工智能/大模型等，入库时判定） |
| `tag_5g` | INT | 通信标签 | 1=含 5G/信号 等（入库时判定） |

### 枚举取值（过滤时用精确值，不要模糊匹配原文）
- `contract_type`：运维 / 建设 / 采购 / 服务 / 咨询
- `industry`：电力 / 通信 / 交通 / 政务 / 其他

> 若用户用词与枚举不完全一致（如“电力行业”→电力、“运维类”→运维），映射到最接近的枚举值。

## 二、提问 → 查询意图映射

### 统计动作（aggregate）
- “有多少 / 数量 / 几个” → `count`
- “总金额 / 合计 / 加起来多少钱” → `sum_amount`
- “有哪些 / 列出 / 编号是什么” → `list`（返回 contract_no + contract_name）
- 复合（“有多少，并给出编号和总金额”）→ 优先 `list`，同时在结果里带上 count 与 total_amount

### 时间词映射（严禁自行推理季度对应月份）
| 用户说法 | 过滤条件 |
|---|---|
| 前两季度 / 上半年 / 一二季度 | `sign_half = 1` |
| 下半年 / 后两季度 | `sign_half = 2` |
| 第 N 季度 / 第N季 | `sign_quarter = N` |
| 前两个季度（不带年份） | `sign_half = 1`，年份按“今天所在年” |
| 2026 年 / 26 年签订的 | `sign_year = 2026` |
| 去年 | `sign_year =（今天所在年 − 1）` |

**未指定年份时**：默认按今天所在年份过滤，并在最终输出末尾用一行声明假设，例如：
`> 假设：未指定年份，按 2026 年统计。`

### 标签映射
- “含 AI / 包含人工智能 / 涉及大模型” → `tag_ai = 1`
- “含 5G / 通信信号相关” → `tag_5g = 1`

## 三、走向量检索的判定（vector_search）
仅当提问**无法用上表离散列命中**时才用向量，典型信号词：
- “**类似 / 相似 / 相关 / 差不多**的合同”
- 关键词不在 `industry` / `contract_type` / 标签体系里的自由描述

流程：先 `vector_search(query=...)` 拿 `contract_ids`，再 `sql_query(contract_ids=[...], aggregate=...)` 统计。
**纯结构化提问不要调用 vector_search。**

## 四、三个标准提问的正确解法（作为示范，也是评测基线）

1. “服务内容包含 AI 的合同有多少，提供编号和总金额”
   → `sql_query(aggregate=list, filters={tag_ai:1})`，输出编号列表 + 数量 + 金额合计。

2. “2026 年签订的运维合同有哪些”
   → `sql_query(aggregate=list, filters={sign_year:2026, contract_type:"运维"})`。

3. “电力行业含 AI 关键词的合同金额是多少”
   → `sql_query(aggregate=sum_amount, filters={industry:"电力", tag_ai:1})`。
