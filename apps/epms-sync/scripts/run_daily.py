#!/usr/bin/env python3
"""每日 EPMS 增量同步入口（cron 调用）。

用法（在 apps/epms-sync 目录下，需 .env 配好）::

  python3 scripts/run_daily.py                # 读 checkpoint 增量
  python3 scripts/run_daily.py --start-from 2026-08-16 --end-to 2026-08-17   # 手动指定区间（不回写 checkpoint）
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
    p.add_argument("--start-from", default=None, help="覆盖起始日期 YYYY-MM-DD（手动测试，不回写 checkpoint）")
    p.add_argument("--end-to", default=None, help="覆盖结束日期 YYYY-MM-DD（默认今天）")
    args = p.parse_args()

    cfg = load_config()
    run_daily(cfg, start_from=args.start_from, end_to=args.end_to)


if __name__ == "__main__":
    main()
