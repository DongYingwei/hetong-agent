"""PDF → Markdown 的本地缓存与可追溯映射。

以 PDF 的 SHA-256 作为稳定键：同一份文件即使改名、从上传临时目录重传，
也能直接找到此前由 MinerU 生成的 Markdown。映射清单存为 UTF-8 JSON，
便于人工查看，也可供上传 API 后续复用。
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
from datetime import datetime, timezone
from typing import Any

from .clients import MineruClient
from .ingest import file_sha256


MANIFEST_NAME = "manifest.json"
MANIFEST_VERSION = 1


def markdown_for_pdf(pdf_path: str | pathlib.Path, output_dir: str | pathlib.Path) -> pathlib.Path | None:
    """按 PDF 内容指纹查已缓存的 Markdown；无命中或文件已丢失时返回 None。"""
    pdf = pathlib.Path(pdf_path)
    return markdown_for_sha256(file_sha256(str(pdf)), output_dir)


def markdown_for_sha256(pdf_sha256: str, output_dir: str | pathlib.Path) -> pathlib.Path | None:
    """按 SHA-256 查缓存，供新上传文件在落临时目录后直接复用。"""
    root = pathlib.Path(output_dir)
    for entry in _load_manifest(root).get("entries", []):
        if entry.get("pdf_sha256") == pdf_sha256:
            candidate = root / entry["markdown_file"]
            return candidate if candidate.is_file() else None
    return None


def convert_pdf(
    pdf_path: str | pathlib.Path,
    output_dir: str | pathlib.Path,
    mineru: MineruClient,
    source_root: str | pathlib.Path | None = None,
    markdown_relative_path: str | pathlib.Path | None = None,
    cache_key: str | None = None,
    source_file: str | pathlib.Path | None = None,
    force: bool = False,
) -> tuple[str, pathlib.Path]:
    """转换一份 PDF 并更新映射。

    返回 ``(status, markdown_path)``，其中 status 为 ``converted`` 或 ``cached``。
    默认跳过已存在的同内容缓存；``force=True`` 才会重新请求 MinerU。
    """
    pdf = pathlib.Path(pdf_path).resolve()
    root = pathlib.Path(output_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    sha = cache_key or file_sha256(str(pdf))
    source = pathlib.Path(source_file).resolve() if source_file is not None else pdf
    manifest = _load_manifest(root)
    existing = _entry_for(manifest, sha)
    target = root / (existing["markdown_file"] if existing else _markdown_path(pdf, sha, markdown_relative_path))

    if existing and target.is_file() and not force:
        _remember_source(existing, source, source_root)
        _write_manifest(root, manifest)
        return "cached", target

    markdown = mineru.parse_pdf(str(pdf))
    if not markdown.strip():
        raise ValueError("MinerU 返回空 Markdown")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(markdown, encoding="utf-8")

    entry: dict[str, Any] = {
        "pdf_sha256": sha,
        "markdown_file": str(target.relative_to(root).as_posix()),
        "markdown_sha256": _text_sha256(markdown),
        "converted_at": _now(),
        "sources": [],
    }
    if existing:
        manifest["entries"].remove(existing)
        entry["sources"] = existing.get("sources", [])
    _remember_source(entry, source, source_root)
    manifest["entries"].append(entry)
    _write_manifest(root, manifest)
    return "converted", target


def iter_pdfs(source_dir: str | pathlib.Path) -> list[pathlib.Path]:
    """递归列出 PDF，跳过输出目录由调用方处理。"""
    root = pathlib.Path(source_dir)
    return sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() == ".pdf")


def _load_manifest(root: pathlib.Path) -> dict[str, Any]:
    path = root / MANIFEST_NAME
    if not path.exists():
        return {"version": MANIFEST_VERSION, "entries": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"映射清单不是合法 JSON：{path}") from exc
    if data.get("version") != MANIFEST_VERSION or not isinstance(data.get("entries"), list):
        raise ValueError(f"映射清单版本或结构不支持：{path}")
    return data


def _write_manifest(root: pathlib.Path, manifest: dict[str, Any]) -> None:
    path = root / MANIFEST_NAME
    temp = path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def _entry_for(manifest: dict[str, Any], sha: str) -> dict[str, Any] | None:
    return next((e for e in manifest["entries"] if e.get("pdf_sha256") == sha), None)


def _remember_source(entry: dict[str, Any], pdf: pathlib.Path, source_root: str | pathlib.Path | None) -> None:
    try:
        relative = str(pdf.relative_to(pathlib.Path(source_root).resolve())) if source_root else pdf.name
    except ValueError:
        relative = str(pdf)
    source = {"relative_path": relative, "size_bytes": pdf.stat().st_size}
    sources = entry.setdefault("sources", [])
    if source not in sources:
        sources.append(source)


def _markdown_path(
    pdf: pathlib.Path, sha: str, markdown_relative_path: str | pathlib.Path | None,
) -> pathlib.Path:
    """构造输出相对路径，保留源目录层级且在文件名中加入内容指纹。"""
    relative = pathlib.Path(markdown_relative_path) if markdown_relative_path else pathlib.Path(pdf.name)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Markdown 相对路径不安全：{relative}")
    stem = re.sub(r"[^\w.\-一-龥]+", "_", pdf.stem, flags=re.UNICODE).strip("_.") or "document"
    # 保留相对目录；最后一段取原 PDF 文件名的安全 stem，避免特殊字符影响文件系统。
    return relative.parent / f"{stem}--{sha[:12]}.md"


def _text_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
