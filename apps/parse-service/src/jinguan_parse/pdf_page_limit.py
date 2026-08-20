"""为超长合同创建仅含前 N 页的临时解析副本；原始 PDF 不做任何修改。"""

from __future__ import annotations

import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


@dataclass(frozen=True)
class ParsePdf:
    path: Path
    total_pages: int
    parsed_pages: int


@contextmanager
def first_pages_for_parse(source: str | Path, page_limit: int) -> Iterator[ParsePdf]:
    """产出供 MinerU 使用的前页副本；页数未超限时直接复用原件。"""
    import pymupdf

    source_path = Path(source).resolve()
    document = pymupdf.open(source_path)
    temporary: Path | None = None
    try:
        total_pages = len(document)
        parsed_pages = min(total_pages, page_limit)
        if total_pages <= page_limit:
            yield ParsePdf(source_path, total_pages, parsed_pages)
            return
        output = pymupdf.open()
        try:
            output.insert_pdf(document, from_page=0, to_page=parsed_pages - 1)
            with tempfile.NamedTemporaryFile(prefix="jingxiaoguan-first-pages-", suffix=".pdf", delete=False) as handle:
                temporary = Path(handle.name)
            output.save(temporary)
        finally:
            output.close()
        yield ParsePdf(temporary, total_pages, parsed_pages)
    finally:
        document.close()
        if temporary is not None:
            temporary.unlink(missing_ok=True)
