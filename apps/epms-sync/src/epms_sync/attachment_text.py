"""从 xlsx / xls / docx / doc / txt / msg 等附件提取纯文本（移植自 epms_process/attachment_text.py）。"""

from __future__ import annotations

import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

import pandas as pd

_PLAIN_SUFFIXES = frozenset({".xlsx", ".xlsm", ".xls", ".docx", ".doc", ".txt", ".msg"})
_DOCX_TAG_RE = re.compile(r"<[^>]+>")


def is_plain_attachment(path: Path) -> bool:
    return path.suffix.lower() in _PLAIN_SUFFIXES


def _html_table_to_text(path: Path) -> str:
    """HTML 伪装的 .xls（老式导出，Excel 可开）→ 提取 table 文本。"""
    tables = pd.read_html(path, encoding="utf-8")
    parts: list[str] = []
    for i, t in enumerate(tables, 1):
        parts.append(f"## 表{i}")
        parts.append(t.astype(str).to_csv(index=False))
    return "\n".join(parts)


def _excel_to_text(path: Path) -> str:
    suf = path.suffix.lower()
    # .xls 老式导出常是 HTML table 伪装；真 .xls 二进制需 xlrd（未装则报错）
    if suf == ".xls":
        head = path.read_bytes()[:256].lstrip()
        if head.startswith(b"<"):
            return _html_table_to_text(path)
        engine = None
    else:
        engine = "openpyxl"  # .xlsx / .xlsm
    sheets = pd.read_excel(path, sheet_name=None, engine=engine)
    parts: list[str] = []
    for name, frame in sheets.items():
        parts.append(f"## {name}")
        parts.append(frame.astype(str).to_csv(index=False))
    return "\n".join(parts)


def _docx_to_text(path: Path) -> str:
    with zipfile.ZipFile(path, "r") as zf:
        xml = zf.read("word/document.xml").decode("utf-8", errors="replace")
    text = _DOCX_TAG_RE.sub(" ", xml)
    return re.sub(r"\s+", " ", text).strip()


def _doc_to_text(path: Path) -> str:
    with tempfile.TemporaryDirectory(prefix="epms_doc_") as tmp:
        out_dir = Path(tmp)
        proc = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "txt:Text",
             "--outdir", str(out_dir), str(path.resolve())],
            capture_output=True, text=True, timeout=120, check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "libreoffice 转换失败")[:300])
        txt_files = list(out_dir.glob("*.txt"))
        if not txt_files:
            raise RuntimeError(f"libreoffice 未生成 txt: {path.name}")
        return txt_files[0].read_text(encoding="utf-8", errors="replace")


def _txt_to_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _msg_to_text(path: Path) -> str:
    text = path.read_bytes().decode("utf-8", errors="replace")
    chunks = re.findall(r"[\x20-\x7e一-鿿]{8,}", text)
    return "\n".join(chunks[:200])


def extract_plain_attachment_text(path: Path) -> str:
    """按扩展名提取附件正文。"""
    suf = path.suffix.lower()
    if suf in {".xlsx", ".xlsm", ".xls"}:
        return _excel_to_text(path)
    if suf == ".docx":
        return _docx_to_text(path)
    if suf == ".doc":
        return _doc_to_text(path)
    if suf == ".txt":
        return _txt_to_text(path)
    if suf == ".msg":
        return _msg_to_text(path)
    raise ValueError(f"不支持的纯文本附件类型: {path.name}")
