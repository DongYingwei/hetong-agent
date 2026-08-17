"""MinerU HTTP 服务同步解析（POST /file_parse）—— 精简自 epms_process/mineru_client.py。

仅保留同步解析路径，用于把图片（PNG/JPG 等）解析为 Markdown。
"""

from __future__ import annotations

import io
import json
import mimetypes
import zipfile
from pathlib import Path
from typing import Any

import requests

MINERU_PARSEABLE_SUFFIXES: frozenset[str] = frozenset(
    {".pdf", ".png", ".jpg", ".jpeg", ".jpe", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
)


def _mime_for_path(path: Path) -> str:
    mt, _ = mimetypes.guess_type(str(path))
    if mt:
        return mt
    suf = path.suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }.get(suf, "application/octet-stream")


def _multipart_form_for_parse() -> list[tuple[str, str]]:
    return [
        ("lang_list", "ch"),
        ("return_md", "true"),
        ("response_format_zip", "false"),
        ("return_original_file", "false"),
        ("backend", "pipeline"),
        ("parse_method", "auto"),
        ("formula_enable", "true"),
        ("table_enable", "true"),
        ("return_middle_json", "false"),
        ("return_model_output", "false"),
        ("return_content_list", "false"),
        ("return_images", "false"),
        ("start_page_id", "0"),
        ("end_page_id", "99999"),
    ]


def _markdown_from_zip_bytes(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
        md_names = sorted(n for n in zf.namelist() if n.lower().endswith(".md"))
        if not md_names:
            raise ValueError("ZIP 响应中未找到 .md 文件")
        parts = [zf.read(n).decode("utf-8", errors="replace") for n in md_names]
        return "\n\n".join(parts) if len(parts) > 1 else parts[0]


def _markdown_from_json(obj: Any, depth: int = 0) -> str | None:
    if depth > 24:
        return None
    if isinstance(obj, dict):
        for key in ("md_content", "markdown", "md", "markdown_text", "content_md",
                    "text_md", "result_md", "full_markdown", "text", "content"):
            v = obj.get(key)
            if isinstance(v, str) and v.strip():
                return v
        for v in obj.values():
            if isinstance(v, (dict, list)):
                got = _markdown_from_json(v, depth + 1)
                if got is not None:
                    return got
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                got = _markdown_from_json(item, depth + 1)
                if got is not None:
                    return got
    return None


def extract_markdown_from_parse_response(r: requests.Response) -> str:
    raw = r.content or b""
    ct = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if raw.startswith(b"PK") or "zip" in ct:
        return _markdown_from_zip_bytes(raw)
    if "json" in ct or raw.strip()[:1] in (b"{", b"["):
        try:
            j = r.json()
        except (ValueError, json.JSONDecodeError):
            pass
        else:
            md = _markdown_from_json(j)
            if md is not None:
                return md
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="replace")
    if text.strip():
        return text
    raise ValueError("无法从响应中解析出 Markdown 或文本内容")


def parse_file_to_markdown(file_path: str | Path, base_url: str, timeout: float = 600.0) -> str:
    """同步 POST /file_parse 并抽出 Markdown 正文。"""
    p = Path(file_path)
    data = _multipart_form_for_parse()
    with p.open("rb") as fh:
        r = requests.post(
            f"{base_url.rstrip('/')}/file_parse",
            files=[("files", (p.name, fh, _mime_for_path(p)))],
            data=data,
            timeout=timeout,
        )
    r.raise_for_status()
    return extract_markdown_from_parse_response(r)
