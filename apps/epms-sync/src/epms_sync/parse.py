"""附件 → Markdown，按订单编号分目录存到 md_dir，生成 manifest.json。

附件文件名约定：``{订单编号}-{序号}{ext}``（订单编号里的 ``/`` 已由下载流程转 ``_``）。
幂等：已存在 md 的订单目录跳过（增量）。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from . import attachment_text, eml_text, mineru_client, pdf_text
from .config import Config

_IMAGE_SUFFIXES = frozenset(
    {".png", ".jpg", ".jpeg", ".jpe", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
)
_ARCHIVE_SUFFIXES = frozenset({".zip", ".rar", ".7z"})
# 订单表文件名（非附件，跳过）
_EXCLUDE_PREFIXES = ("订单信息", "_验证", "epms_")

_ATTACH_RE = re.compile(r"^(.+)-(\d+)\.([a-zA-Z0-9]+)$")


def _parse_filename(name: str) -> tuple[str, int] | None:
    m = _ATTACH_RE.match(name)
    if not m:
        return None
    return m.group(1), int(m.group(2))


def _extract_text(path: Path, cfg: Config) -> str:
    suf = path.suffix.lower()
    if suf in pdf_text.PDF_SUFFIXES:
        return pdf_text.pdf_to_markdown(path)
    if suf in _IMAGE_SUFFIXES:
        return mineru_client.parse_file_to_markdown(path, cfg.mineru_base_url)
    if suf == ".eml":
        return eml_text.eml_to_text(path, cfg)
    if attachment_text.is_plain_attachment(path):
        return attachment_text.extract_plain_attachment_text(path)
    raise ValueError(f"不支持的附件类型: {path.name}")


def parse_attachments(cfg: Config) -> dict[str, list[str]]:
    """解析 attach_dir 下所有附件为 md，返回 manifest（订单编号 -> md 相对路径列表）。"""
    md_dir = cfg.md_dir
    md_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, list[str]] = {}
    parsed = skipped = skipped_existing = failed = 0

    for f in sorted(cfg.attach_dir.iterdir()):
        if not f.is_file():
            continue
        if f.name.startswith(_EXCLUDE_PREFIXES):
            continue
        if f.suffix.lower() in _ARCHIVE_SUFFIXES:
            continue
        meta = _parse_filename(f.name)
        if meta is None:
            print(f"[parse] 跳过(文件名不匹配): {f.name}", file=sys.stderr)
            skipped += 1
            continue
        order_no, idx = meta

        sub = md_dir / order_no
        dest = sub / f"{idx}.md"
        # 已有非空结果一律幂等跳过。历史空 EML 则允许在解析器升级后重试，
        # 扫描件/图片的空结果仍跳过，避免每天重复触发昂贵的 MinerU 调用。
        retry_empty_eml = dest.is_file() and dest.stat().st_size == 0 and f.suffix.lower() == ".eml"
        if dest.is_file() and not retry_empty_eml:
            manifest.setdefault(order_no, []).append(f"{order_no}/{idx}.md")
            skipped_existing += 1
            continue  # 已解析（含空正文），幂等跳过

        try:
            text = _extract_text(f, cfg)
        except Exception as e:  # noqa: BLE001
            print(f"[parse] 解析失败 {f.name}: {type(e).__name__}: {e}", file=sys.stderr)
            failed += 1
            continue

        sub.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        manifest.setdefault(order_no, []).append(f"{order_no}/{idx}.md")
        parsed += 1

    manifest = {k: sorted(v) for k, v in manifest.items()}
    (md_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"[parse] 解析 {parsed}，已存在跳过 {skipped_existing}，"
        f"文件名不匹配 {skipped}，失败 {failed}；订单 {len(manifest)} 个",
        file=sys.stderr,
    )
    return manifest
