"""订单台账读模型的来源规整与增量写入。

全量导入只用于受控初始化；每日 EPMS 同步通过 ``upsert_incremental_orders`` 更新。
来源快照、人工字段覆盖和 ``sys_order`` 读模型分层，避免新数据覆盖人工核对结果。
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import psycopg


COLUMNS = {
    "项目编号": "project_no", "项目名称": "project_name", "明细项目编号": "detail_project_no", "订单编号": "order_no",
    "客方订单号": "customer_order_no", "订单名称": "order_name", "合同编号": "contract_no", "客户名称": "customer_name",
    "客户线": "customer_line", "客户类型": "customer_type", "结算方式": "settlement_type", "订单类型": "order_type", "订单属性": "order_attr",
    "业务员": "salesperson", "客方合同编号": "customer_contract_no", "客方服务对象": "customer_service_target", "客方项目经理": "customer_pm",
    "客方订单名称": "customer_order_name", "生成日期": "created_date", "接受日期": "accepted_date", "订单开始日期": "start_date",
    "订单结束日期": "end_date", "预计开票日期": "est_invoice_date", "订单状态": "order_status", "订单税率(%)": "tax_rate",
    "订单含税总额": "amount", "订单不含税总额": "amount_ex_tax", "订单明细单号": "detail_order_no", "客方订单明细单号": "customer_detail_order_no",
    "赎期(天)": "redemption_days", "是否末单": "is_last_order", "明细税率(%)": "detail_tax_rate", "明细含税金额": "detail_amount",
    "明细不含税金额": "detail_amount_ex_tax", "扣款含税金额": "deduct_amount", "扣款不含税金额": "deduct_amount_ex_tax",
    "停止开票含税金额": "stop_invoice_amount", "停止开票不含税金额": "stop_invoice_amount_ex_tax", "确认收入含税总额": "confirmed_income_amount",
    "确认收入不含税总额": "confirmed_income_amount_ex_tax", "未确认收入含税金额": "unconfirmed_income_amount",
    "未确认收入不含税金额": "unconfirmed_income_amount_ex_tax", "已开票含税总额": "invoiced_amount", "已开票不含税总额": "invoiced_amount_ex_tax",
    "已回款含税金额": "returned_amount", "已回款不含税金额": "returned_amount_ex_tax", "已开票未回款含税金额": "invoiced_unreturned_amount",
    "已开票未回款不含税金额": "invoiced_unreturned_amount_ex_tax", "区域": "region", "省份": "province", "地市": "city",
    "交付人员名单": "delivery_list", "制单人": "maker", "制单时间": "make_time", "明细制单人": "detail_maker",
    "明细制单时间": "detail_make_time", "更新人": "updater", "更新时间": "update_time", "审核人": "auditor", "审核时间": "audit_time",
    "附件": "has_attachment", "最新附件上传时间": "latest_attachment_time", "uuid": "source_uuid", "epms_attach_status": "epms_attach_status",
}
DATE_COLUMNS = {"created_date", "accepted_date", "start_date", "end_date", "est_invoice_date"}
TIMESTAMP_COLUMNS = {"make_time", "detail_make_time", "update_time", "audit_time", "latest_attachment_time"}
NUMBER_COLUMNS = {"tax_rate", "amount", "amount_ex_tax", "detail_tax_rate", "detail_amount", "detail_amount_ex_tax", "deduct_amount", "deduct_amount_ex_tax", "stop_invoice_amount", "stop_invoice_amount_ex_tax", "confirmed_income_amount", "confirmed_income_amount_ex_tax", "unconfirmed_income_amount", "unconfirmed_income_amount_ex_tax", "invoiced_amount", "invoiced_amount_ex_tax", "returned_amount", "returned_amount_ex_tax", "invoiced_unreturned_amount", "invoiced_unreturned_amount_ex_tax", "redemption_days"}
DERIVED_FIELDS = ("assessment_line", "income_confirmed", "attachment_count", "has_eml", "tag_ai", "hit_keyword", "ai_keywords")
ALL_FIELDS = tuple(COLUMNS.values()) + DERIVED_FIELDS
# 这些字段由 EPMS/同步状态控制，不接受页面人工覆盖。
SOURCE_ONLY_FIELDS = {"source_uuid", "epms_attach_status", "attachment_count", "has_eml", "tag_ai", "hit_keyword", "ai_keywords"}
AI_SUMMARY_FIELDS = {"tag_ai", "hit_keyword", "ai_keywords"}


def norm_order_no(value: object) -> str:
    return re.sub(r"[\\\\/]", "_", str(value).strip())


def clean(value: object, col: str):
    if pd.isna(value):
        return None
    if col in DATE_COLUMNS:
        parsed = pd.to_datetime(value, errors="coerce")
        return None if pd.isna(parsed) else parsed.date()
    if col in TIMESTAMP_COLUMNS:
        parsed = pd.to_datetime(value, errors="coerce")
        return None if pd.isna(parsed) else parsed.to_pydatetime()
    if col in NUMBER_COLUMNS:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    return str(value).strip() or None


def database_url() -> str:
    explicit = os.getenv("ORDER_PG_URL", "").strip()
    if explicit:
        return explicit
    user = quote(os.getenv("DB_USER", "postgres"), safe="")
    password = quote(os.getenv("DB_PASSWORD", "postgres"), safe="")
    host = os.getenv("DB_HOST", "127.0.0.1")
    port = os.getenv("DB_PORT", "5432")
    database = os.getenv("DB_NAME", "contract_assistant")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def build_order_rows(excel_path: Path, ai_results: dict[str, dict]) -> list[dict]:
    df = pd.read_excel(excel_path)
    if "订单编号" not in df.columns or df["订单编号"].isna().any() or df["订单编号"].duplicated().any():
        raise ValueError("Excel 的订单编号缺失或重复，拒绝写入订单台账")
    ai_by_norm = {norm_order_no(key): value for key, value in ai_results.items()}
    rows: list[dict] = []
    for _, source_row in df.iterrows():
        item = {target: clean(source_row.get(source), target) for source, target in COLUMNS.items()}
        result = ai_by_norm.get(norm_order_no(item["order_no"]), {})
        is_ai = result.get("verdict") == "是"
        item.update({
            "assessment_line": item["customer_line"],
            "income_confirmed": 1 if str(source_row.get("收入确认标记") or "") == "已确认" else 0,
            "attachment_count": len(result.get("md_files") or []),
            "has_eml": "否",
            "tag_ai": 1 if is_ai else 0,
            "hit_keyword": "AI" if is_ai else None,
            "ai_keywords": list(result.get("hits") or []),
        })
        rows.append(item)
    return rows


def _json_default(value: object):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"cannot encode {type(value)!r}")


def _db_values(row: dict) -> list[object]:
    return [json.dumps(row[field], ensure_ascii=False) if field == "ai_keywords" else row[field] for field in ALL_FIELDS]


def _ensure_incremental_schema(cur, migration_path: Path) -> None:
    cur.execute(migration_path.read_text(encoding="utf-8"))


def upsert_incremental_orders(database_url: str, rows: list[dict], migration_path: Path) -> dict:
    """将本次 EPMS 增量写入读模型，返回需要重新进行 AI 模块归类的订单号。"""
    if not rows:
        return {"inserted_or_updated": 0, "module_reanalysis_order_nos": []}
    fields = list(ALL_FIELDS)
    placeholders = ",".join("%s::jsonb" if field == "ai_keywords" else "%s" for field in fields)
    protected = [field for field in fields if field not in SOURCE_ONLY_FIELDS]
    updates = []
    for field in fields:
        if field in protected:
            updates.append(
                f"{field}=CASE WHEN EXISTS (SELECT 1 FROM order_field_overrides o "
                f"WHERE o.order_id=sys_order.id AND o.field_name='{field}') "
                f"THEN sys_order.{field} ELSE EXCLUDED.{field} END"
            )
        elif field in AI_SUMMARY_FIELDS:
            # 人工关键词解析会为四个模块写 model_raw='manual'；该结论优先于附件初筛。
            updates.append(
                f"{field}=CASE WHEN EXISTS (SELECT 1 FROM order_module_hits m "
                f"WHERE m.order_id=sys_order.id AND m.model_raw='manual') "
                f"THEN sys_order.{field} ELSE EXCLUDED.{field} END"
            )
        else:
            updates.append(f"{field}=EXCLUDED.{field}")
    sql = f"INSERT INTO sys_order ({','.join(fields)}) VALUES ({placeholders}) " \
          f"ON CONFLICT(order_no) DO UPDATE SET {','.join(updates)},updated_at=now()"
    order_nos = [str(row["order_no"]) for row in rows]
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        _ensure_incremental_schema(cur, migration_path)
        cur.executemany(sql, [_db_values(row) for row in rows])
        cur.execute("SELECT id,order_no FROM sys_order WHERE order_no = ANY(%s)", (order_nos,))
        ids = {order_no: order_id for order_id, order_no in cur.fetchall()}
        # 每次来源变更都清掉自动模块结果；manual 结果由 model_raw 标记保护。
        cur.execute("""DELETE FROM order_module_hits
                        WHERE order_id = ANY(%s)
                          AND COALESCE(model_raw, '') <> 'manual'""", (list(ids.values()),))
        source_sql = """INSERT INTO order_sync_sources(order_id,source_values,source_uuid,source_audit_time,synced_at)
                        VALUES (%s,%s::jsonb,%s,%s,now())
                        ON CONFLICT(order_id) DO UPDATE SET source_values=EXCLUDED.source_values,
                          source_uuid=EXCLUDED.source_uuid,source_audit_time=EXCLUDED.source_audit_time,synced_at=now()"""
        for row in rows:
            source_values = json.dumps(row, ensure_ascii=False, default=_json_default)
            cur.execute(source_sql, (ids[row["order_no"]], source_values, row.get("source_uuid"), row.get("audit_time")))
        conn.commit()
    return {
        "inserted_or_updated": len(rows),
        "module_reanalysis_order_nos": [row["order_no"] for row in rows if row["tag_ai"] == 1],
    }


def _comparable(value: object):
    if value is None or value == "":
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, (int, float)):
        return str(value)
    return str(value).strip()


def seed_source_baseline(database_url: str, rows: list[dict], migration_path: Path) -> dict:
    """以已审核全量 Excel 建立来源基线，并把与当前台账不同的字段保护为人工覆盖。

    这是首次启用增量同步的部署步骤，用于识别旧版“直接改 sys_order”留下的人工改动。
    """
    if not rows:
        return {"snapshots": 0, "detected_overrides": 0, "missing_orders": []}
    order_nos = [str(row["order_no"]) for row in rows]
    detected = 0
    missing: list[str] = []
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        _ensure_incremental_schema(cur, migration_path)
        cur.execute("SELECT id,order_no,to_jsonb(sys_order) FROM sys_order WHERE order_no = ANY(%s)", (order_nos,))
        current = {order_no: (order_id, values) for order_id, order_no, values in cur.fetchall()}
        for row in rows:
            found = current.get(row["order_no"])
            if found is None:
                missing.append(row["order_no"])
                continue
            order_id, current_values = found
            cur.execute("""INSERT INTO order_sync_sources(order_id,source_values,source_uuid,source_audit_time,synced_at)
                            VALUES (%s,%s::jsonb,%s,%s,now())
                            ON CONFLICT(order_id) DO UPDATE SET source_values=EXCLUDED.source_values,
                              source_uuid=EXCLUDED.source_uuid,source_audit_time=EXCLUDED.source_audit_time,synced_at=now()""",
                        (order_id, json.dumps(row, ensure_ascii=False, default=_json_default), row.get("source_uuid"), row.get("audit_time")))
            for field in ALL_FIELDS:
                if field in SOURCE_ONLY_FIELDS or field == "order_no":
                    continue
                if _comparable(current_values.get(field)) == _comparable(row.get(field)):
                    continue
                cur.execute("""INSERT INTO order_field_overrides(order_id,field_name,manual_value,updated_by)
                               VALUES (%s,%s,%s::jsonb,'baseline-migration')
                               ON CONFLICT(order_id,field_name) DO NOTHING""",
                            (order_id, field, json.dumps(current_values.get(field), ensure_ascii=False, default=_json_default)))
                detected += cur.rowcount
        conn.commit()
    return {"snapshots": len(rows) - len(missing), "detected_overrides": detected, "missing_orders": missing}
