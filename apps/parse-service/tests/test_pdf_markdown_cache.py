from __future__ import annotations

from pathlib import Path

from jinguan_parse.pdf_markdown_cache import convert_pdf, markdown_for_pdf


class FakeMineru:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def parse_pdf(self, pdf_path: str) -> str:
        self.calls.append(pdf_path)
        return "# 已转换合同\n\n正文"


def test_convert_records_content_fingerprint_and_reuses_after_rename(tmp_path: Path):
    source = tmp_path / "pdfs"
    source.mkdir()
    pdf = source / "原合同.pdf"
    pdf.write_bytes(b"same-pdf-content")
    cache = source / "md-pdf"
    mineru = FakeMineru()

    status, markdown = convert_pdf(pdf, cache, mineru, source)

    assert status == "converted"
    assert markdown.read_text(encoding="utf-8") == "# 已转换合同\n\n正文"
    assert len(mineru.calls) == 1
    assert markdown_for_pdf(pdf, cache) == markdown

    renamed = source / "新上传文件.pdf"
    renamed.write_bytes(b"same-pdf-content")
    status, matched = convert_pdf(renamed, cache, mineru, source)

    assert status == "cached"
    assert matched == markdown
    assert len(mineru.calls) == 1
    manifest = (cache / "manifest.json").read_text(encoding="utf-8")
    assert "原合同.pdf" in manifest
    assert "新上传文件.pdf" in manifest


def test_convert_keeps_relative_directory_structure(tmp_path: Path):
    source = tmp_path / "pdfs"
    pdf = source / "客户A" / "2026" / "合同.pdf"
    pdf.parent.mkdir(parents=True)
    pdf.write_bytes(b"pdf-content")
    cache = source / "md-pdf"

    _, markdown = convert_pdf(
        pdf, cache, FakeMineru(), source,
        markdown_relative_path=pdf.relative_to(source),
    )

    assert markdown.parent == cache / "客户A" / "2026"
    assert markdown.name.startswith("合同--")
