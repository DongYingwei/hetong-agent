"""每日增量编排：导出 → 补 uuid → 下载附件 → 解析 md → AI 判定 → 更新 state。"""

from __future__ import annotations

import sys
from datetime import date

from . import ai_scan, download, export, parse as parse_mod, state
from .config import Config
from .epms_login import get_cookie_header

DOWNLOAD_WORKERS = 8


def run_daily(cfg: Config, *, start_from: str | None = None, end_to: str | None = None) -> None:
    today = end_to or date.today().isoformat()
    last_start = start_from or state.load_last_start_time(
        cfg.state_path, default=cfg.initial_start_time
    )
    # 显式指定区间（手动测试）时不回写 checkpoint
    update_state = start_from is None
    print(f"[pipeline] 增量区间: startTime [{last_start}, {today}]", file=sys.stderr)

    cookie = get_cookie_header(cfg)
    if not cookie:
        raise SystemExit("[pipeline] EPMS 登录失败，未更新 checkpoint，请检查 .env 账号密码")

    # 1) 导出 + 补 uuid
    work_dir = cfg.state_path.parent / ".epms-sync-work"
    try:
        excel_path = export.export_and_enrich(
            cfg, cookie, start_from=last_start, end_to=today, work_dir=work_dir
        )
    except RuntimeError as e:
        if "无导出数据" in str(e) or "error" in str(e).lower():
            print(f"[pipeline] 区间内无新订单：{e}，仅推进 checkpoint", file=sys.stderr)
            if update_state:
                state.save_state(cfg.state_path, last_start_time=today)
            return
        raise

    # 2) 下载附件（跳过「附件=无」）
    n_orders, n_files = download.download_for_excel(
        cfg, cookie, excel_path, workers=DOWNLOAD_WORKERS
    )
    print(f"[pipeline] 下载完成：处理 {n_orders} 订单，成功附件 {n_files}", file=sys.stderr)

    # 3) 解析 md（幂等，跳过已存在）
    manifest = parse_mod.parse_attachments(cfg)
    print(f"[pipeline] 解析完成：涉及订单 {len(manifest)} 个", file=sys.stderr)

    # 4) AI 关键词判定（订单级）
    ai_scan.scan_orders(cfg)

    # 5) 推进 checkpoint
    if update_state:
        state.save_state(cfg.state_path, last_start_time=today)
        print(f"[pipeline] 完成，checkpoint 推进到 {today}", file=sys.stderr)
    else:
        print("[pipeline] 完成（手动区间，未回写 checkpoint）", file=sys.stderr)
