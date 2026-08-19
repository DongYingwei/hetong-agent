"""核对 → 正式库 adapter（T04 第一切片）。

草稿(contracts_draft, confirmed=0) → 人工核对 → 写正式表 contracts(confirmed=1)
+ 把草稿的 module_hits JSONB 展开成 contract_module_hits 行（每模块一行）。

设计：薄 adapter，注入连接（可对临时 PG 测试）。一个事务内完成：
  ① 从草稿读全字段 → INSERT contracts（confirmed=1, confirmed_by/at）
  ② 展开 module_hits JSONB → INSERT contract_module_hits（外键指向新 contracts.id）
不碰向量/Milvus/同步（那是 T04 后续切片，需 G2 端点 + G5 机制）。

坑9 守则：只有核对入正式库(confirmed=1)才可能建向量；草稿区永不建。本切片只写 PG。
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from psycopg import Connection


def md_md5(markdown: str | None) -> str | None:
    """MinerU 全文 md 的 MD5（切片3 同步比对用）。None/空 → None。"""
    if not markdown:
        return None
    return hashlib.md5(markdown.encode("utf-8")).hexdigest()

# 正式表 contracts 里从草稿搬运的列（标量 AI 主列 + 手工列 + tag_ai）。
# 与 contracts_draft / persist._AI_COLS 对齐；日期/金额主列草稿是 NULL（原文在 _ai_raw），照搬。
_COPY_COLS = [
    "contract_no",
    # 手工列（草稿阶段可能为空，核对时人工补；此处照搬草稿现值）
    "assessment_line", "bid_no", "related_main_no", "framework_alias", "status",
    # 标量 AI 主列
    "customer_name", "contract_name", "customer_contract_no", "signing_entity",
    "contract_type", "sign_date", "start_date", "end_date",
    "amount_type", "amount", "tax_rate", "settlement_terms",
    "post_eval", "deposit_amount", "deposit_refund", "arbitration", "authorizer",
    "tag_ai",
]

# _ai_raw 留痕列（17 个非模块 AI 字段）
_AI_RAW_COLS = [
    "customer_name_ai_raw", "contract_name_ai_raw", "customer_contract_no_ai_raw",
    "signing_entity_ai_raw", "contract_type_ai_raw", "sign_date_ai_raw",
    "start_date_ai_raw", "end_date_ai_raw", "amount_type_ai_raw", "amount_ai_raw",
    "tax_rate_ai_raw", "settlement_terms_ai_raw", "post_eval_ai_raw",
    "deposit_amount_ai_raw", "deposit_refund_ai_raw", "arbitration_ai_raw",
    "authorizer_ai_raw",
]


class DraftNotFound(Exception):
    pass


def confirm_draft(
    conn: Connection,
    draft_id: int,
    confirmed_by: str,
    overrides: dict[str, object] | None = None,
    now: datetime | None = None,
) -> int:
    """把草稿核对入正式库，返回新 contracts.id。

    - `overrides`：人工核对时对某些字段的修正（列名→值），覆盖草稿的 AI 值。
    - `now`：核对时间（默认当前 UTC；测试可注入）。
    - 幂等/安全：同一 contract_no 已在正式库 → UNIQUE 冲突抛错（不重复入库）。
    """
    overrides = overrides or {}
    stamp = now or datetime.now(timezone.utc)

    with conn.cursor() as cur:
        # ① 读草稿全行（按列名取）；mineru_md 搬运至正式库供切片3 同步比对/重建
        all_cols = _COPY_COLS + _AI_RAW_COLS + ["module_hits", "mineru_md"]
        cur.execute(
            f"SELECT {', '.join(all_cols)} FROM contracts_draft WHERE id = %s",
            (draft_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise DraftNotFound(f"草稿 id={draft_id} 不存在")
        data = dict(zip(all_cols, row))

        # 应用人工修正
        for k, v in overrides.items():
            if k in data:
                data[k] = v

        # ② 写正式库 contracts（confirmed=1 + 核对留痕 + 全文 md 及其 md5）
        mineru_md = data["mineru_md"]
        insert_cols = (_COPY_COLS + _AI_RAW_COLS
                       + ["confirmed", "confirmed_by", "confirmed_at", "mineru_md", "mineru_md5"])
        insert_vals = ([data[c] for c in _COPY_COLS + _AI_RAW_COLS]
                       + [1, confirmed_by, stamp, mineru_md, md_md5(mineru_md)])
        placeholders = ", ".join(["%s"] * len(insert_vals))
        cur.execute(
            f"INSERT INTO contracts ({', '.join(insert_cols)}) "
            f"VALUES ({placeholders}) RETURNING id",
            insert_vals,
        )
        contract_id = cur.fetchone()[0]

        # ③ 展开 module_hits JSONB → contract_module_hits 行
        raw_hits = data["module_hits"]
        hits = raw_hits if isinstance(raw_hits, list) else json.loads(raw_hits or "[]")
        for h in hits:
            cur.execute(
                "INSERT INTO contract_module_hits "
                "(contract_id, module_key, hit, keywords, category, raw_text, raw_text_ai_raw) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    contract_id,
                    h["module_key"],
                    int(h.get("hit", 0)),
                    h.get("keywords"),
                    h.get("category"),
                    h.get("raw_text"),
                    h.get("raw_text_ai_raw"),
                ),
            )

        # ④ 将上传/批量导入时创建的合同包从草稿绑定切换到正式合同。
        # 必须先清空 draft_id，随后删除草稿时外键不会丢失已确认合同关联。
        cur.execute("""UPDATE contract_packages
                          SET draft_id=NULL, contract_id=%s, status='confirmed', confirmed_at=%s
                        WHERE draft_id=%s""", (contract_id, stamp, draft_id))

        # ⑤ 标记草稿已核对（不删，留审计；confirmed 列在草稿表受 CHECK=0 约束，
        #    故用独立标记：这里删除草稿或加处理标记二选一。首版直接删草稿避免重复核对。）
        cur.execute("DELETE FROM contracts_draft WHERE id = %s", (draft_id,))

    conn.commit()
    return contract_id
