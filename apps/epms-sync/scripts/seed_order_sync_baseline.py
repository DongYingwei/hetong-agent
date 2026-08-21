#!/usr/bin/env python3
"""首次启用订单每日增量同步前，按审核全量 Excel 建立来源基线。"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from epms_sync.order_ledger import build_order_rows, database_url, seed_source_baseline  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path, required=True, help="当前已审核的全量订单 Excel")
    parser.add_argument("--ai-results", type=Path, required=True, help="当前 ai_keyword_results.json")
    parser.add_argument("--database-url", default=database_url())
    parser.add_argument("--migration", type=Path, default=ROOT / "apps/gateway/scripts/migrations/016_order_incremental_sync.sql")
    args = parser.parse_args()
    results = json.loads(args.ai_results.read_text(encoding="utf-8"))
    outcome = seed_source_baseline(args.database_url, build_order_rows(args.xlsx, results), args.migration)
    print(json.dumps(outcome, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
