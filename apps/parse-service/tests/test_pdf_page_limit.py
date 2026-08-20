from __future__ import annotations

import pathlib
import sys

import pymupdf

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))

from jinguan_parse.pdf_page_limit import first_pages_for_parse  # noqa: E402


def test_first_pages_for_parse_keeps_original_and_limits_temporary_copy(tmp_path):
    source = tmp_path / "long-contract.pdf"
    document = pymupdf.open()
    for _ in range(80):
        document.new_page()
    document.save(source)
    document.close()

    with first_pages_for_parse(source, 50) as prepared:
        assert prepared.total_pages == 80
        assert prepared.parsed_pages == 50
        assert prepared.path != source
        assert len(pymupdf.open(prepared.path)) == 50

    assert source.exists()
