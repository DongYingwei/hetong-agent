#!/usr/bin/env python3
"""受控全量重导订单台账。

每日任务不能调用本脚本：它会清空订单表。字段规整逻辑与增量同步共用
``epms_sync.order_ledger``，避免两条链路产生不一致数据。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from epms_sync.order_ledger import ALL_FIELDS, build_order_rows, database_url, norm_order_no  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_XLSX = ROOT / "data/EPMS/订单信息_2026年_含uuid.xlsx"
DEFAULT_AI = ROOT / "data/md-epms/ai_keyword_results.json"
INCREMENTAL_MIGRATION = ROOT / "apps/gateway/scripts/migrations/016_order_incremental_sync.sql"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--ai-results", type=Path, default=DEFAULT_AI)
    parser.add_argument("--database-url", default=database_url())
    parser.add_argument("--migration", type=Path, default=ROOT / "apps/gateway/scripts/migrations/003_order_ledger.sql")
    args = parser.parse_args()
    ai = json.loads(args.ai_results.read_text(encoding="utf-8"))
    rows = build_order_rows(args.xlsx, ai)
    placeholders = ",".join("%s::jsonb" if field == "ai_keywords" else "%s" for field in ALL_FIELDS)
    sql = f"INSERT INTO sys_order ({','.join(ALL_FIELDS)}) VALUES ({placeholders})"
    values = [[json.dumps(row[field], ensure_ascii=False) if field == "ai_keywords" else row[field] for field in ALL_FIELDS] for row in rows]
    with psycopg.connect(args.database_url) as conn, conn.cursor() as cur:
        cur.execute(args.migration.read_text(encoding="utf-8"))
        cur.execute(INCREMENTAL_MIGRATION.read_text(encoding="utf-8"))
        cur.execute("TRUNCATE contract_order_links, order_field_overrides, order_sync_sources, order_manual_overrides, order_module_hits, sys_order RESTART IDENTITY")
        cur.executemany(sql, values)
        conn.commit()
    result_keys = {norm_order_no(key) for key in ai}
    order_keys = {norm_order_no(row["order_no"]) for row in rows}
    print(json.dumps({"orders": len(rows), "ai_orders": sum(row["tag_ai"] for row in rows),
                      "attachment_orders": len(result_keys & order_keys),
                      "unmatched_result_keys": sorted(result_keys - order_keys)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
