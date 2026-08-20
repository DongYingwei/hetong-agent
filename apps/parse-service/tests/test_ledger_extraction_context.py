from __future__ import annotations

import pathlib
import sys

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))

from jinguan_parse.extract import ledger_extraction_context  # noqa: E402


def test_uses_content_before_first_page_beyond_limit():
    markdown = "首页字段\n\nPage 2 of 800\n第二页\n\nPage 51 of 800\n附件正文"
    assert ledger_extraction_context(markdown, page_limit=50) == "首页字段\n\nPage 2 of 800\n第二页"


def test_falls_back_to_bounded_prefix_when_page_markers_are_missing():
    markdown = "x" * 20
    assert ledger_extraction_context(markdown, page_limit=50, fallback_chars=8) == "x" * 8


def test_non_positive_limit_keeps_full_markdown():
    markdown = "全文"
    assert ledger_extraction_context(markdown, page_limit=0) == markdown
