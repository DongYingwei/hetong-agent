"""增量 checkpoint —— 记录已获取到的「审核日期」，避免每天全量重拉。

state 文件（JSON）：::

  {"last_review_date": "2026-08-16", "last_run_at": "2026-08-17T02:30:00"}

``last_review_date`` 表示下次按审核时间拉取的起始日期（含）。旧 checkpoint 的
``last_start_time`` 会自动迁移读取，避免首次升级误全量重拉。
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path


def load_last_review_date(state_path: Path, *, default: str) -> str:
    """读上次已统计到的日期；文件不存在或字段缺失则返回 default（首次增量起点）。"""
    if not state_path.is_file():
        return default
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default
    val = str(data.get("last_review_date") or data.get("last_start_time") or "").strip()
    return val or default


def save_state(state_path: Path, *, last_review_date: str) -> None:
    """原子写回 checkpoint（临时文件 + os.replace）。"""
    state_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "last_review_date": last_review_date,
        "last_run_at": datetime.now().isoformat(timespec="seconds"),
    }
    tmp = state_path.with_suffix(state_path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, state_path)
