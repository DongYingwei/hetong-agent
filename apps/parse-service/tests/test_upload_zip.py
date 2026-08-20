from io import BytesIO
from pathlib import Path
import sys
import zipfile

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from jinguan_parse.api import _deduplicate_contract_files, _extract_contract_zip, _split_upload_groups


def make_zip(entries: dict[str, bytes]) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_contract_zip_extracts_supported_files_and_ignores_other_files():
    result = _extract_contract_zip(make_zip({
        "合同/主合同.pdf": b"pdf",
        "合同/附件.docx": b"docx",
        "合同/说明.txt": b"ignore",
    }), "合同包.zip")
    assert result == [("合同/主合同.pdf", b"pdf"), ("合同/附件.docx", b"docx")]


def test_contract_zip_rejects_path_traversal():
    with pytest.raises(HTTPException, match="非法路径"):
        _extract_contract_zip(make_zip({"../outside.pdf": b"bad"}), "bad.zip")


def test_contract_package_deduplicates_same_content_with_different_names():
    result = _deduplicate_contract_files([
        ("主合同.pdf", b"same-pdf"),
        ("主合同-副本.pdf", b"same-pdf"),
        ("附件.pdf", b"different-pdf"),
    ])
    assert result == [("主合同.pdf", b"same-pdf"), ("附件.pdf", b"different-pdf")]


def test_zip_top_level_directories_become_independent_contracts():
    groups = _split_upload_groups([
        ("合同甲/主合同.pdf", b"a"),
        ("合同甲/附件.pdf", b"b"),
        ("合同乙/主合同.pdf", b"c"),
        ("根目录合同.pdf", b"d"),
    ])
    assert groups == [
        ("合同甲", [("主合同.pdf", b"a"), ("附件.pdf", b"b")]),
        ("合同乙", [("主合同.pdf", b"c")]),
        ("根目录合同.pdf", [("根目录合同.pdf", b"d")]),
    ]
