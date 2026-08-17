#!/usr/bin/env python3
"""以 EPMS 全量 Excel 覆盖运营库订单台账，并保留附件 AI 扫描结果。

只操作 contract_assistant.sys_order / order_module_hits；绝不操作 contracts 合同库。
订单号的 / 和 \\ 与附件目录中的 _ 视为同一个编号，保证结果可关联。
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]
GATEWAY_ENV = ROOT / "apps/gateway/.env"
DEFAULT_XLSX = ROOT / "data/EPMS/订单信息_2026年_含uuid.xlsx"
DEFAULT_AI = ROOT / "data/md-epms/ai_keyword_results.json"

COLUMNS = {
    "项目编号":"project_no", "项目名称":"project_name", "明细项目编号":"detail_project_no", "订单编号":"order_no",
    "客方订单号":"customer_order_no", "订单名称":"order_name", "合同编号":"contract_no", "客户名称":"customer_name",
    "客户线":"customer_line", "客户类型":"customer_type", "结算方式":"settlement_type", "订单类型":"order_type", "订单属性":"order_attr",
    "业务员":"salesperson", "客方合同编号":"customer_contract_no", "客方服务对象":"customer_service_target", "客方项目经理":"customer_pm",
    "客方订单名称":"customer_order_name", "生成日期":"created_date", "接受日期":"accepted_date", "订单开始日期":"start_date",
    "订单结束日期":"end_date", "预计开票日期":"est_invoice_date", "订单状态":"order_status", "订单税率(%)":"tax_rate",
    "订单含税总额":"amount", "订单不含税总额":"amount_ex_tax", "订单明细单号":"detail_order_no", "客方订单明细单号":"customer_detail_order_no",
    "赎期(天)":"redemption_days", "是否末单":"is_last_order", "明细税率(%)":"detail_tax_rate", "明细含税金额":"detail_amount",
    "明细不含税金额":"detail_amount_ex_tax", "扣款含税金额":"deduct_amount", "扣款不含税金额":"deduct_amount_ex_tax",
    "停止开票含税金额":"stop_invoice_amount", "停止开票不含税金额":"stop_invoice_amount_ex_tax", "确认收入含税总额":"confirmed_income_amount",
    "确认收入不含税总额":"confirmed_income_amount_ex_tax", "未确认收入含税金额":"unconfirmed_income_amount",
    "未确认收入不含税金额":"unconfirmed_income_amount_ex_tax", "已开票含税总额":"invoiced_amount", "已开票不含税总额":"invoiced_amount_ex_tax",
    "已回款含税总额":"returned_amount", "已回款不含税总额":"returned_amount_ex_tax", "已开票未回款含税金额":"invoiced_unreturned_amount",
    "已开票未回款不含税金额":"invoiced_unreturned_amount_ex_tax", "区域":"region", "省份":"province", "地市":"city",
    "交付人员名单":"delivery_list", "制单人":"maker", "制单时间":"make_time", "明细制单人":"detail_maker",
    "明细制单时间":"detail_make_time", "更新人":"updater", "更新时间":"update_time", "审核人":"auditor", "审核时间":"audit_time",
    "附件":"has_attachment", "最新附件上传时间":"latest_attachment_time", "uuid":"source_uuid", "epms_attach_status":"epms_attach_status",
}
DATE_COLUMNS = {"created_date","accepted_date","start_date","end_date","est_invoice_date"}
TIMESTAMP_COLUMNS = {"make_time","detail_make_time","update_time","audit_time","latest_attachment_time"}
NUMBER_COLUMNS = {"tax_rate","amount","amount_ex_tax","detail_tax_rate","detail_amount","detail_amount_ex_tax","deduct_amount","deduct_amount_ex_tax","stop_invoice_amount","stop_invoice_amount_ex_tax","confirmed_income_amount","confirmed_income_amount_ex_tax","unconfirmed_income_amount","unconfirmed_income_amount_ex_tax","invoiced_amount","invoiced_amount_ex_tax","returned_amount","returned_amount_ex_tax","invoiced_unreturned_amount","invoiced_unreturned_amount_ex_tax","redemption_days"}

def norm_order_no(value: object) -> str:
    return re.sub(r"[\\\\/]", "_", str(value).strip())

def clean(value: object, col: str):
    if pd.isna(value): return None
    if col in DATE_COLUMNS:
        v = pd.to_datetime(value, errors="coerce")
        return None if pd.isna(v) else v.date()
    if col in TIMESTAMP_COLUMNS:
        v = pd.to_datetime(value, errors="coerce")
        return None if pd.isna(v) else v.to_pydatetime()
    if col in NUMBER_COLUMNS:
        try: return float(value)
        except (TypeError, ValueError): return None
    return str(value).strip() or None

def database_url() -> str:
    load_dotenv(GATEWAY_ENV)
    return os.getenv("ORDER_PG_URL") or "postgresql://{user}:{password}@{host}:{port}/{db}".format(
        user=os.getenv("DB_USER", "postgres"), password=os.getenv("DB_PASSWORD", "postgres"),
        host=os.getenv("DB_HOST", "127.0.0.1"), port=os.getenv("DB_PORT", "5432"), db=os.getenv("DB_NAME", "contract_assistant"))

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    ap.add_argument("--ai-results", type=Path, default=DEFAULT_AI)
    ap.add_argument("--database-url", default=database_url())
    ap.add_argument("--migration", type=Path, default=ROOT / "apps/gateway/scripts/migrations/003_order_ledger.sql")
    args = ap.parse_args()
    df = pd.read_excel(args.xlsx)
    if "订单编号" not in df.columns or df["订单编号"].isna().any() or df["订单编号"].duplicated().any():
        raise SystemExit("Excel 的订单编号缺失或重复，拒绝覆盖订单台账")
    ai = json.loads(args.ai_results.read_text(encoding="utf-8"))
    ai_by_norm = {norm_order_no(k): v for k, v in ai.items()}
    fields = list(COLUMNS.values()) + ["assessment_line","income_confirmed","attachment_count","has_eml","tag_ai","hit_keyword","ai_keywords"]
    placeholders = ",".join(["%s"] * len(fields))
    sql = f"INSERT INTO sys_order ({','.join(fields)}) VALUES ({placeholders})"
    rows = []
    matched_ai = 0
    for _, row in df.iterrows():
        item = {target: clean(row.get(source), target) for source, target in COLUMNS.items()}
        source_no = item["order_no"]
        result = ai_by_norm.get(norm_order_no(source_no), {})
        is_ai = result.get("verdict") == "是"
        matched_ai += int(is_ai)
        item.update({
            "assessment_line": item["customer_line"],
            "income_confirmed": 1 if str(row.get("收入确认标记") or "") == "已确认" else 0,
            "attachment_count": len(result.get("md_files") or []),
            "has_eml": "否",  # 附件明细未保存在 Excel；后续解析可按 manifest 补写。
            "tag_ai": 1 if is_ai else 0,
            "hit_keyword": "AI" if is_ai else None,
            "ai_keywords": json.dumps(result.get("hits") or [], ensure_ascii=False),
        })
        rows.append([item[k] for k in fields])
    with psycopg.connect(args.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(args.migration.read_text(encoding="utf-8"))
            # 本导入是用户确认的全量替换：删除的仅是旧订单演示/历史导入，不触碰合同。
            cur.execute("TRUNCATE order_module_hits, sys_order RESTART IDENTITY")
            cur.executemany(sql, rows)
        conn.commit()
    result_keys = {norm_order_no(x) for x in ai}
    excel_keys = {norm_order_no(x) for x in df["订单编号"]}
    print(json.dumps({"orders":len(rows), "ai_orders":matched_ai, "attachment_orders":len(result_keys & excel_keys), "unmatched_result_keys":sorted(result_keys-excel_keys)}, ensure_ascii=False, indent=2))

if __name__ == "__main__": main()
