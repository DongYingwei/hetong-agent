"""每日增量编排：导出 → 补 uuid → 下载附件 → 解析 md → AI 判定 → 更新 state。"""

from __future__ import annotations

import subprocess
import sys
from datetime import date
from pathlib import Path

from . import ai_scan, download, export, parse as parse_mod, state
from .config import Config
from .epms_login import get_cookie_header
from .order_ledger import build_order_rows, database_url, upsert_incremental_orders

DOWNLOAD_WORKERS = 8
_ROOT = Path(__file__).resolve().parents[3]
_ORDER_SYNC_MIGRATION = _ROOT / "gateway" / "scripts" / "migrations" / "016_order_incremental_sync.sql"
_MODULE_ANALYSIS = _ROOT / "epms-sync" / "scripts" / "analyze_order_ai_modules.py"


def _analyze_incremental_ai_orders(cfg: Config, order_nos: list[str]) -> None:
    """仅重算本次来源更新且全文命中 AI 的订单；人工模块结果由分析脚本保留。"""
    if not order_nos:
        return
    command = [sys.executable, str(_MODULE_ANALYSIS), "--database-url", database_url(),
               "--ai-results", str(cfg.md_dir / "ai_keyword_results.json")]
    for order_no in order_nos:
        command.extend(["--order-no", order_no])
    print(f"[pipeline] 开始四模块归类：{len(order_nos)} 个 AI 订单", file=sys.stderr)
    subprocess.run(command, check=True)


def run_daily(cfg: Config, *, review_from: str | None = None, review_to: str | None = None) -> None:
    today = review_to or date.today().isoformat()
    last_review = review_from or state.load_last_review_date(
        cfg.state_path, default=cfg.initial_review_date
    )
    # 显式指定区间（手动测试）时不回写 checkpoint
    update_state = review_from is None
    print(f"[pipeline] 增量区间: reviewTime [{last_review}, {today}]", file=sys.stderr)

    cookie = get_cookie_header(cfg)
    if not cookie:
        raise SystemExit("[pipeline] EPMS 登录失败，未更新 checkpoint，请检查 .env 账号密码")

    # 1) 导出 + 补 uuid
    work_dir = cfg.state_path.parent / ".epms-sync-work"
    try:
        excel_path = export.export_and_enrich(
            cfg, cookie, review_from=last_review, review_to=today, work_dir=work_dir
        )
    except RuntimeError as e:
        if "无导出数据" in str(e) or "error" in str(e).lower():
            print(f"[pipeline] 区间内无新订单：{e}，仅推进 checkpoint", file=sys.stderr)
            if update_state:
                state.save_state(cfg.state_path, last_review_date=today)
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
    ai_results = ai_scan.scan_orders(cfg)

    # 5) 订单读模型增量 upsert：新增订单立即进入页面；来源字段更新不会覆盖人工字段。
    sync_result = upsert_incremental_orders(
        database_url(), build_order_rows(excel_path, ai_results), _ORDER_SYNC_MIGRATION,
    )
    print(f"[pipeline] 台账增量入库：{sync_result['inserted_or_updated']} 条", file=sys.stderr)

    # 6) 本次 AI 订单完成四模块归类后才推进 checkpoint，失败会在下次定时继续重试。
    _analyze_incremental_ai_orders(cfg, sync_result["module_reanalysis_order_nos"])

    # 7) 推进 checkpoint
    if update_state:
        state.save_state(cfg.state_path, last_review_date=today)
        print(f"[pipeline] 完成，checkpoint 推进到 {today}", file=sys.stderr)
    else:
        print("[pipeline] 完成（手动区间，未回写 checkpoint）", file=sys.stderr)
