"""落库 adapter —— DraftContract → contracts_draft 一行。

薄 adapter（codebase-design）：把编排产出的 DraftContract 写进 PG 草稿区。
模块命中存 JSONB（草稿阶段；ADR-0004 + 表结构决策：正式表外键不能引用未入库草稿）。
核对入正式库 + 展开 contract_module_hits 是 T04 的事，不在此。

依赖注入：接受一个 psycopg 连接（真实或测试库），不自建 → 可对临时 PG 测试。
"""

from __future__ import annotations

import json

from psycopg import Connection

from .extract import DraftContract


# contracts_draft 里 17 个标量 AI 列（与 schema.flat_ai_fields 键一致）
_AI_COLS = [
    "customer_name", "contract_name", "customer_contract_no", "signing_entity",
    "contract_type", "sign_date", "start_date", "end_date",
    "amount_type", "amount", "tax_rate", "settlement_terms",
    "post_eval", "deposit_amount", "deposit_refund", "arbitration", "authorizer",
]

# 日期列需 DATE 类型：草稿区留原始字符串在 _ai_raw，规整值写主列。
# 首版不做日期规整（LLM 直出格式多样），主日期列先写 NULL，真值在 <field>_ai_raw。
# 规整逻辑后续里程碑补（需真值样本）。
_DATE_COLS = {"sign_date", "start_date", "end_date"}
# amount/deposit_amount 主列是 DECIMAL：草稿区同理，原文入 _ai_raw，主列 NULL（可能"20.73万元"非纯数字）。
_DECIMAL_COLS = {"amount", "deposit_amount"}


def insert_draft(conn: Connection, contract_no: str, draft: DraftContract,
                 source_sha256: str | None = None) -> int:
    """把 DraftContract 写进 contracts_draft，返回新行 id。

    - 标量 AI 值里，DATE/DECIMAL 主列首版写 NULL（原文保留在 <field>_ai_raw），
      文本列直接写；全部候选写 <field>_ai_raw 留痕。
    - 模块命中写 module_hits JSONB。
    - contract_no 必填（手工列，但草稿需有键；此处由调用方给，缺省用 AI 抽取的合同名兜底）。
    """
    cols: list[str] = ["contract_no", "tag_ai", "confirmed", "module_hits", "mineru_md"]
    vals: list[object] = [contract_no, draft.tag_ai, 0, json.dumps(
        [h.__dict__ for h in draft.module_hits], ensure_ascii=False), draft.mineru_md]

    # 标量 AI 主列（DATE/DECIMAL 首版跳过，避免类型转换失败）
    for c in _AI_COLS:
        if c in _DATE_COLS or c in _DECIMAL_COLS:
            continue
        cols.append(c)
        vals.append(draft.ai_fields.get(c))

    # 留痕列 <field>_ai_raw（全部 17 个，含 DATE/DECIMAL 原文）
    for c in _AI_COLS:
        cols.append(f"{c}_ai_raw")
        vals.append(draft.ai_raw.get(f"{c}_ai_raw"))

    if source_sha256 is not None:
        cols.append("source_sha256")
        vals.append(source_sha256)

    placeholders = ", ".join(["%s"] * len(vals))
    col_sql = ", ".join(cols)
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO contracts_draft ({col_sql}) VALUES ({placeholders}) RETURNING id",
            vals,
        )
        new_id = cur.fetchone()[0]
    conn.commit()
    return new_id
