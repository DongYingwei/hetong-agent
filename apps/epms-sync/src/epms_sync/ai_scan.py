"""AI 关键词判定 —— 从数据库 ai_keyword_terms 加载词表，复用 jinguan_parse.keyword_scan 扫描。

判定粒度：订单级（合并该订单所有 md 后做全文扫描，任一命中即「是」）。
输出 ai_keyword_results.json：``{订单编号: {verdict, hits, md_files}}``。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import psycopg

from .config import Config

# 复用 jinguan_parse.keyword_scan（hetong-agent 的解析侧包）
_PARSE_SERVICE_SRC = Path(__file__).resolve().parents[3] / "parse-service" / "src"
if str(_PARSE_SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(_PARSE_SERVICE_SRC))

from jinguan_parse.keyword_scan import ScanKeyword, scan_fulltext_markdown  # noqa: E402


def _load_keywords(cfg: Config) -> list[ScanKeyword]:
    """从 ai_keywords + ai_keyword_terms 加载启用的父词及子词（与 api._list_keywords 同源）。"""
    if not cfg.pg_url:
        print("[ai_scan] PG_URL 未配置，跳过关键词判定", file=sys.stderr)
        return []
    with psycopg.connect(cfg.pg_url) as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT k.id, k.name,
                      COALESCE(array_agg(t.term ORDER BY t.term) FILTER (WHERE t.term IS NOT NULL), '{}')
               FROM ai_keywords k LEFT JOIN ai_keyword_terms t ON t.keyword_id = k.id
               WHERE k.enabled
               GROUP BY k.id, k.name ORDER BY k.id"""
        )
        keywords = [ScanKeyword(r[0], r[1], tuple(r[2] or [])) for r in cur.fetchall()]
    print(f"[ai_scan] 加载关键词 {len(keywords)} 组", file=sys.stderr)
    return keywords


def scan_orders(cfg: Config) -> dict[str, dict]:
    """对 md_dir 下每个订单合并 md 做判定，写 ai_keyword_results.json。"""
    keywords = _load_keywords(cfg)
    if not keywords:
        print("[ai_scan] 无关键词（PG 未配置或词表为空），跳过判定，保留已有结果", file=sys.stderr)
        return {}
    md_dir = cfg.md_dir
    if not md_dir.is_dir():
        print(f"[ai_scan] md 目录不存在: {md_dir}", file=sys.stderr)
        return {}

    results: dict[str, dict] = {}
    hit_orders = 0
    orders = sorted(d for d in md_dir.iterdir() if d.is_dir())

    for od in orders:
        md_files = sorted(p for p in od.iterdir() if p.suffix.lower() == ".md")
        parts = [p.read_text(encoding="utf-8", errors="replace") for p in md_files]
        text = "\n".join(parts)

        hits = scan_fulltext_markdown(text, keywords) if keywords else []
        matched = list(dict.fromkeys(h.matched_term for h in hits if h.matched_term))
        verdict = "是" if matched else "否"
        if verdict == "是":
            hit_orders += 1
        results[od.name] = {
            "verdict": verdict,
            "hits": matched,
            "md_files": [p.name for p in md_files],
        }

    out_path = md_dir / "ai_keyword_results.json"
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"[ai_scan] 判定 {len(orders)} 个订单，命中 {hit_orders}，结果 {out_path}",
        file=sys.stderr,
    )
    return results
