#!/usr/bin/env python3
"""每日 EPMS 增量同步入口（cron 调用）。

用法（在 apps/epms-sync 目录下，需 .env 配好）::

  python3 scripts/run_daily.py                # 读 checkpoint 增量
  python3 scripts/run_daily.py --review-from 2026-08-16 --review-to 2026-08-17   # 手动指定审核时间区间（不回写 checkpoint）
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 让 `python3 scripts/run_daily.py` 能 import src/epms_sync
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from epms_sync.config import load_config  # noqa: E402
from epms_sync.pipeline import run_daily  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description="EPMS 增量同步（导出→下载→解析→AI 判定）")
    p.add_argument("--review-from", "--start-from", dest="review_from", default=None, help="覆盖审核起始日期/时间（手动测试，不回写 checkpoint）")
    p.add_argument("--review-to", "--end-to", dest="review_to", default=None, help="覆盖审核结束日期/时间（默认今天）")
    args = p.parse_args()

    cfg = load_config()
    run_daily(cfg, review_from=args.review_from, review_to=args.review_to)


if __name__ == "__main__":
    main()
