from io import BytesIO
from pathlib import Path
import sys
import zipfile

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from jinguan_parse.api import _extract_contract_zip


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
    assert result == [("主合同.pdf", b"pdf"), ("附件.docx", b"docx")]


def test_contract_zip_rejects_path_traversal():
    with pytest.raises(HTTPException, match="非法路径"):
        _extract_contract_zip(make_zip({"../outside.pdf": b"bad"}), "bad.zip")
