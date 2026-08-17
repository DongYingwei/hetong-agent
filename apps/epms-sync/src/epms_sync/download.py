"""按 uuid 下载附件到 attach_dir（精简自 epms_process/epms_contract_fetch.py）。"""

from __future__ import annotations

import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import requests

from .config import Config

DOWNLOAD_PATH = "/saas/contractInfoCtrl/downloadFile.do"
ATTACH_LIST = "/saas/contractInfoCtrl/toAttachmentList.do"
YS_ATTACH_LIST = "/saas/contractInfoCtrl/toYsAttachmentList.do"

_print_lock = threading.Lock()


def _safe_filename(name: str) -> str:
    name = name.strip() or "unnamed"
    return re.sub(r'[<>:"/\\|?*]', "_", name)


def build_attachment_save_filename(save_key: str, index: int, attachment_name: str) -> str:
    ext = Path(attachment_name or "").suffix
    ext = _safe_filename(ext) if ext else ""
    base = _safe_filename((save_key or "").strip() or "unnamed")
    return f"{base}-{int(index)}{ext}"


def _attachment_type_query_param(attachment_row: dict | None) -> str:
    if not attachment_row:
        return "ht"
    for key in ("typeParam", "typeCode", "downloadType"):
        v = attachment_row.get(key)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip().lower()
        if len(s) == 2 and s.isalpha():
            return s
    name = str(attachment_row.get("attachmentName") or "").strip().lower()
    if name.endswith(".eml"):
        return "ys"
    raw = attachment_row.get("type")
    s = "" if raw is None or (isinstance(raw, float) and pd.isna(raw)) else str(raw).strip()
    if s:
        mapped = {"合同": "ht", "验收": "ys", "邮件": "ys", "原始": "ys"}.get(s)
        if mapped:
            return mapped
        if len(s) == 2 and s.isalpha():
            return s.lower()
    return "ht"


def _attachment_name_for_download_query(attachment_name: str) -> str:
    return quote(str(attachment_name or ""), safe="")


def _download_file_request_url(
    base: str, puuid: str, attachment_name: str, attachment_row: dict | None
) -> str:
    name_q = _attachment_name_for_download_query(attachment_name)
    puuid_q = quote(str(puuid or "").strip(), safe="")
    type_q = quote(_attachment_type_query_param(attachment_row), safe="")
    return f"{base}{DOWNLOAD_PATH}?attachmentName={name_q}&puuid={puuid_q}&type={type_q}"


def get_attachments(sess: requests.Session, base: str, puuid: str) -> list[dict]:
    """合同 + 验收附件合并列表（按 uuid / (attachmentName, type) 去重）。"""
    out: list[dict] = []
    seen: set[tuple] = set()
    for path in (ATTACH_LIST, YS_ATTACH_LIST):
        r = sess.post(base + path, data={"sortOrder": "asc", "queryParam": puuid}, timeout=120)
        r.raise_for_status()
        payload = r.json()
        rows = payload.get("rows") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            uid = str(row.get("uuid") or "").strip()
            key = ("uuid", uid) if uid else (
                "name",
                str(row.get("attachmentName") or row.get("fileName") or "").strip(),
                str(row.get("type") or "").strip(),
            )
            if key in seen:
                continue
            seen.add(key)
            out.append(row)
    return out


def download_file(
    sess: requests.Session,
    base: str,
    puuid: str,
    attachment_name: str,
    attachment_row: dict | None,
    *,
    save_key: str,
    index: int,
    save_dir: Path,
) -> bool:
    """下载单个附件到 ``save_dir/{save_key}-{index}{ext}``。已存在且非空则跳过。"""
    fname = build_attachment_save_filename(save_key, index, attachment_name)
    dest = save_dir / fname
    if dest.is_file() and dest.stat().st_size > 0:
        return True  # 已下载，幂等跳过

    url = _download_file_request_url(base, puuid, attachment_name, attachment_row)
    r = sess.get(url, stream=True, headers={"Content-Type": None}, timeout=300)
    r.raise_for_status()

    ctype = r.headers.get("Content-Type", "")
    if "application/json" in ctype or "text/html" in ctype:
        chunk = next(r.iter_content(chunk_size=4096), b"")
        if chunk.startswith(b"{") or chunk.startswith(b"<"):
            with _print_lock:
                print(f"下载可能失败（返回 JSON/HTML）: {attachment_name}\n{chunk[:200]!r}", file=sys.stderr)
            return False

    save_dir.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=65536):
            if chunk:
                f.write(chunk)
    with _print_lock:
        print(f"  已保存: {dest}", file=sys.stderr)
    return True


def _process_one_uuid(
    sess: requests.Session,
    base: str,
    save_dir: Path,
    puuid: str,
    save_key: str,
) -> tuple[int, int]:
    """返回 (附件数, 成功下载数)。"""
    attachments = get_attachments(sess, base, puuid)
    if not attachments:
        return 0, 0
    ok = 0
    for i, a in enumerate(attachments, start=1):
        name = a.get("attachmentName") or a.get("fileName") or "unknown"
        if download_file(sess, base, puuid, name, a, save_key=save_key, index=i, save_dir=save_dir):
            ok += 1
    return len(attachments), ok


def download_for_excel(
    cfg: Config,
    cookie: str,
    excel_path: Path,
    *,
    workers: int = 8,
    only_has_attachment: bool = True,
) -> tuple[int, int]:
    """按 Excel 的 uuid 列下载附件，返回 (处理订单数, 成功下载附件数)。"""
    df = pd.read_excel(excel_path)
    if "uuid" not in df.columns:
        raise RuntimeError("Excel 缺少 uuid 列")

    save_dir = cfg.attach_dir
    save_dir.mkdir(parents=True, exist_ok=True)

    sess = requests.Session()
    sess.trust_env = False
    sess.headers.update({
        "Cookie": cookie,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
    })

    rows = []
    for _, row in df.iterrows():
        puuid = str(row.get("uuid") or "").strip()
        if not puuid:
            continue
        if only_has_attachment and "附件" in df.columns:
            if str(row.get("附件") or "").strip() != "有":
                continue
        save_key = str(row.get("订单编号") or "").strip() or puuid
        rows.append((puuid, save_key))

    print(f"[download] 待下载订单 {len(rows)} 个，workers={workers}", file=sys.stderr)
    if not rows:
        return 0, 0

    n_ok = 0
    n_processed = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futs = {
            pool.submit(_process_one_uuid, sess, cfg.epms_base_url, save_dir, puuid, save_key): puuid
            for puuid, save_key in rows
        }
        for fut in as_completed(futs):
            na, ok = fut.result()
            n_processed += 1
            n_ok += ok
            if n_processed % 50 == 0 or n_processed == len(rows):
                print(f"[download] 进度 {n_processed}/{len(rows)}，累计成功附件 {n_ok}", file=sys.stderr)
    return n_processed, n_ok
