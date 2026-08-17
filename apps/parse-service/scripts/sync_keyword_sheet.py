#!/usr/bin/env python3
"""将合同台账「AI业绩关键词」Sheet 的具体技术词同步到唯一父关键词 AI。"""

from __future__ import annotations

import argparse
from pathlib import Path

import psycopg

from jinguan_parse.config import load_settings
from jinguan_parse.taxonomy import load_taxonomy


def main() -> None:
    parser = argparse.ArgumentParser(description="同步 AI业绩关键词 Sheet 到 contracts.ai_keyword_terms")
    parser.add_argument("--xlsx", type=Path, default=None, help="合同台账 xlsx 路径；默认读取服务配置")
    parser.add_argument("--sheet", default=None, help="工作表名称；默认读取服务配置")
    args = parser.parse_args()

    settings = load_settings()
    xlsx = args.xlsx or Path(settings.ledger_xlsx)
    sheet = args.sheet or settings.keyword_sheet
    if not xlsx.is_file():
        raise SystemExit(f"找不到台账文件：{xlsx}")

    taxonomy = load_taxonomy(str(xlsx), sheet)
    terms = list(dict.fromkeys(term for values in taxonomy.values() for term in values))
    if not terms:
        raise SystemExit(f"工作表「{sheet}」中没有可同步的具体技术词")

    rule = "台账 AI业绩关键词具体技术词；中文精确包含，英文忽略大小写且按完整单词匹配"
    with psycopg.connect(settings.pg_url) as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO ai_keywords(name, match_rules, enabled)
                       VALUES ('AI', %s, TRUE)
                       ON CONFLICT (name) DO UPDATE SET match_rules=EXCLUDED.match_rules, enabled=TRUE
                       RETURNING id""", (rule,))
        keyword_id = cur.fetchone()[0]
        # Sheet 是唯一事实来源：用其 60 个具体技术词完全替换旧的 AI 子词。
        cur.execute("DELETE FROM ai_keyword_terms WHERE keyword_id=%s", (keyword_id,))
        cur.executemany("INSERT INTO ai_keyword_terms(keyword_id, term) VALUES (%s, %s)",
                        [(keyword_id, term) for term in terms])
    print(f"已同步：父关键词 AI；大方向 {len(taxonomy)} 个（仅作来源分类）；具体技术词 {len(terms)} 个")


if __name__ == "__main__":
    main()
