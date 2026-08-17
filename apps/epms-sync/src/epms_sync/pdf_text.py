"""用 PyMuPDF 从 PDF 提取文本为 Markdown（移植自 epms_process/pdf_text.py）。"""

from __future__ import annotations

from pathlib import Path

PDF_SUFFIXES: frozenset[str] = frozenset({".pdf"})


def pdf_to_markdown(path: str | Path) -> str:
    """按页提取纯文本，页间用 ``## Page N`` 分隔。扫描版 PDF 无文字层时可能为空。"""
    import pymupdf as fitz  # PyMuPDF 新版模块名；保留 fitz 变量兼容现有调用

    p = Path(path)
    parts: list[str] = []
    with fitz.open(p) as doc:
        for i, page in enumerate(doc, start=1):
            text = (page.get_text("text") or "").strip()
            parts.append(f"## Page {i}\n\n{text}\n")
    return "\n".join(parts).strip() + "\n"
