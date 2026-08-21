"""落库 adapter —— DraftContract → contracts_draft 一行。

薄 adapter（codebase-design）：把编排产出的 DraftContract 写进 PG 草稿区。
模块命中存 JSONB（草稿阶段；ADR-0004 + 表结构决策：正式表外键不能引用未入库草稿）。
核对入正式库 + 展开 contract_module_hits 是 T04 的事，不在此。

依赖注入：接受一个 psycopg 连接（真实或测试库），不自建 → 可对临时 PG 测试。
"""

from __future__ import annotations

import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from psycopg import Connection

from .extract import DraftContract


# contracts_draft 里 17 个标量 AI 列（与 schema.flat_ai_fields 键一致）
_AI_COLS = [
    "customer_name", "contract_name", "customer_contract_no", "signing_entity",
    "contract_type", "sign_date", "start_date", "end_date",
    "amount_type", "amount", "tax_rate", "settlement_terms",
    "post_eval", "deposit_amount", "deposit_refund", "arbitration", "authorizer",
]

# 日期列、金额列同时保留 AI 原文，主列写可安全规整的值，便于台账展示和统计。
# 无法确定的格式不猜测：主列仍为 NULL，人工核对时可依据 *_ai_raw 修正。
_DATE_COLS = {"sign_date", "start_date", "end_date"}
_DECIMAL_COLS = {"amount", "deposit_amount"}

_DATE_RE = re.compile(r"^\s*(\d{4})\s*(?:年|[-./])\s*(\d{1,2})\s*(?:月|[-./])\s*(\d{1,2})\s*(?:日)?\s*$")
_AMOUNT_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")


def normalize_date(value: str | None) -> date | None:
    """把常见中文/ISO 日期规整为 DATE；不完整或非法日期返回 None。"""
    if not value:
        return None
    matched = _DATE_RE.match(value.replace("－", "-").replace("／", "/"))
    if not matched:
        return None
    try:
        return date(*(int(part) for part in matched.groups()))
    except ValueError:
        return None


def normalize_amount(value: str | None) -> Decimal | None:
    """把带人民币符号、括号或万/亿元单位的单一金额规整为元。"""
    if not value:
        return None
    text = (value.replace(",", "").replace("，", "").replace("￥", "")
                 .replace("¥", "").replace("（", "(").replace("）", ")"))
    matches = _AMOUNT_RE.findall(text)
    # 多个数字（如“30%预付款”）不能可靠判断金额，交给人工核对。
    if len(matches) != 1:
        return None
    try:
        amount = Decimal(matches[0])
    except InvalidOperation:
        return None
    if "亿元" in text:
        return amount * Decimal("100000000")
    if "万元" in text:
        return amount * Decimal("10000")
    return amount


def insert_draft(conn: Connection, contract_no: str, draft: DraftContract,
                 source_sha256: str | None = None,
                 suggested_contract_no: str | None = None) -> int:
    """把 DraftContract 写进 contracts_draft，返回新行 id。

    - 标量 AI 值中，能安全规整的 DATE/DECIMAL 写入主列；原文始终保留在
      <field>_ai_raw，不能规整时主列为 NULL。
    - 模块命中写 module_hits JSONB。
    - contract_no 必填（手工列，但草稿需有键；此处由调用方给，缺省用 AI 抽取的合同名兜底）。
    """
    cols: list[str] = ["contract_no", "tag_ai", "confirmed", "module_hits", "mineru_md"]
    vals: list[object] = [contract_no, draft.tag_ai, 0, json.dumps(
        [h.__dict__ for h in draft.module_hits], ensure_ascii=False), draft.mineru_md]

    # 标量 AI 主列（日期/金额采用保守规整，避免把描述中的数字误作金额）。
    for c in _AI_COLS:
        cols.append(c)
        raw = draft.ai_fields.get(c)
        if c in _DATE_COLS:
            vals.append(normalize_date(raw))
        elif c in _DECIMAL_COLS:
            vals.append(normalize_amount(raw))
        else:
            vals.append(raw)

    # 留痕列 <field>_ai_raw（全部 17 个，含 DATE/DECIMAL 原文）
    for c in _AI_COLS:
        cols.append(f"{c}_ai_raw")
        vals.append(draft.ai_raw.get(f"{c}_ai_raw"))

    if source_sha256 is not None:
        cols.append("source_sha256")
        vals.append(source_sha256)
    if suggested_contract_no is not None:
        cols.append("suggested_contract_no")
        vals.append(suggested_contract_no)

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
