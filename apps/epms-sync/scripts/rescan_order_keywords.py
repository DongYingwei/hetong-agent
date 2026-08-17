#!/usr/bin/env python3
"""领取关键词重扫任务中的订单项：全文精确扫描后，仅候选项调用本地模型判定四模块。"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "apps" / "epms-sync" / "src"), str(ROOT / "apps" / "parse-service" / "src"), str(ROOT / "apps" / "epms-sync" / "scripts")]
from epms_sync.config import load_config
from epms_sync.ai_scan import _load_keywords
from jinguan_parse.keyword_scan import scan_fulltext_markdown
from analyze_order_ai_modules import MODULES, call_model
from import_order_ledger import database_url, norm_order_no


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", type=int, required=True)
    args = parser.parse_args()
    cfg = load_config()
    keywords = _load_keywords(cfg)
    with psycopg.connect(database_url()) as conn:
        while True:
            with conn.cursor() as cur:
                cur.execute("""SELECT i.entity_id,o.order_no,o.project_name FROM keyword_rescan_job_items i
                  JOIN sys_order o ON o.id=i.entity_id WHERE i.job_id=%s AND i.entity_type='order' AND i.status IN ('queued','running')
                  ORDER BY i.entity_id LIMIT 1""", (args.job_id,))
                row = cur.fetchone()
            if row is None:
                break
            order_id, order_no, project_name = row
            try:
                with conn.cursor() as cur:
                    cur.execute("UPDATE keyword_rescan_job_items SET status='running',started_at=COALESCE(started_at,now()) WHERE job_id=%s AND entity_type='order' AND entity_id=%s", (args.job_id, order_id))
                directory = cfg.md_dir / norm_order_no(order_no)
                files = sorted(directory.glob('*.md')) if directory.is_dir() else []
                text = '\n\n'.join(path.read_text(encoding='utf-8', errors='replace') for path in files if path.stat().st_size)
                if not text:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE keyword_rescan_job_items SET status='skipped',error_message='无可扫描附件 Markdown',finished_at=now() WHERE job_id=%s AND entity_type='order' AND entity_id=%s", (args.job_id, order_id))
                    conn.commit(); continue
                hits = scan_fulltext_markdown(text, keywords)
                terms = list(dict.fromkeys(hit.matched_term for hit in hits if hit.matched_term))
                with conn.cursor() as cur:
                    cur.execute("UPDATE sys_order SET tag_ai=%s,hit_keyword=%s,ai_keywords=%s,updated_at=now() WHERE id=%s", (1 if terms else 0, ','.join(terms) or None, json.dumps(terms), order_id))
                    cur.execute("DELETE FROM order_module_hits WHERE order_id=%s", (order_id,))
                if terms:
                    answer, raw = call_model(os.getenv('QWEN_BASE', 'http://192.168.101.214:6015/v1'), os.getenv('QWEN_MODEL', 'Qwen3-30B-A3B'), project_name or '', text, terms)
                    values = []
                    for key in MODULES:
                        item = answer.get(key) if isinstance(answer.get(key), dict) else {}
                        matched = [value for value in (item.get('keywords') or []) if value in terms]
                        values.append((order_id, key, 1 if item.get('hit') is True and matched else 0, ','.join(matched) or None, str(item.get('evidence') or '')[:500] or None, raw))
                    with conn.cursor() as cur:
                        cur.executemany("""INSERT INTO order_module_hits(order_id,module_key,hit,keywords,raw_text,model_raw)
                          VALUES (%s,%s,%s,%s,%s,%s)""", values)
                with conn.cursor() as cur:
                    cur.execute("UPDATE keyword_rescan_job_items SET status='success',error_message=NULL,finished_at=now() WHERE job_id=%s AND entity_type='order' AND entity_id=%s", (args.job_id, order_id))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                with conn.cursor() as cur:
                    cur.execute("UPDATE keyword_rescan_job_items SET status='failed',error_message=%s,finished_at=now() WHERE job_id=%s AND entity_type='order' AND entity_id=%s", (str(exc)[:1000], args.job_id, order_id))
                conn.commit()


if __name__ == '__main__':
    main()
