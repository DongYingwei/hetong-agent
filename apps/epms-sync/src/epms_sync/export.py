"""增量导出订单 Excel（63 列）+ 补 uuid。

- ``export_orders_excel``：getExportData.do → exportExcel.do 两步导出完整 Excel。
- ``enrich_uuid``：offset 分页拉 toList 建索引，按「订单编号」补 uuid 列。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import quote

import pandas as pd
import requests

from .config import Config

EXPORT_TRIGGER = "/saas/contractInfoCtrl/getExportData.do"
EXPORT_DOWNLOAD = "/saas/contractInfoCtrl/exportExcel.do"
LIST = "/saas/contractInfoCtrl/toList.do"
PAGE_SIZE = 500

# 订单编号可能命中的 EPMS 字段
_MATCH_FIELDS = ("contractNo", "contractNO", "custOrderNo", "custOrderNO", "orderNo", "orderNO")


def _headers(cfg: Config, cookie: str) -> dict[str, str]:
    return {
        "Cookie": cookie,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": cfg.epms_base_url,
        "Referer": cfg.epms_base_url + "/saas/",
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
    }


def _review_time(value: str, *, is_end: bool) -> str:
    """日期参数补齐为 EPMS reviewTime 所需的完整时间；保留调用方提供的精确时间。"""
    value = value.strip()
    if " " in value or "T" in value:
        return value.replace("T", " ")
    return f"{value} {'23:59:59' if is_end else '00:00:00'}"


def _review_query_param(review_from: str, review_to: str) -> dict[str, str]:
    return {
        "uuid": "",
        "reviewState": "",
        "reviewTimeSt": _review_time(review_from, is_end=False),
        "reviewTimeEd": _review_time(review_to, is_end=True),
    }


def export_orders_excel(
    cfg: Config, cookie: str, *, review_from: str, review_to: str, out_path: Path
) -> Path:
    """按审核时间 [review_from, review_to] 导出完整订单 Excel（63 列）。"""
    qp = json.dumps(_review_query_param(review_from, review_to), ensure_ascii=False)
    qp_encoded = quote(quote(qp, safe=""), safe="")  # 前端 encodeURI(encodeURI(...))

    sess = requests.Session()
    sess.trust_env = False
    sess.headers.update(_headers(cfg, cookie))

    # 1) 触发导出
    r = sess.post(
        cfg.epms_base_url + EXPORT_TRIGGER,
        data={"queryParam": qp_encoded, "gdData": "0"},
        timeout=120,
    )
    r.raise_for_status()
    if r.text.strip() != "ok":
        raise RuntimeError(f"导出接口返回 {r.text!r}（无导出数据或参数无效）")

    # 2) 下载导出文件（同一 session）
    r2 = sess.post(cfg.epms_base_url + EXPORT_DOWNLOAD, data={}, timeout=600)
    r2.raise_for_status()
    body = r2.content
    if body[:2] != b"PK":
        raise RuntimeError(f"exportExcel.do 未返回 Excel（前 200 字节={body[:200]!r}）")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(body)
    return out_path


def _fetch_rows(cfg: Config, cookie: str, query_param: dict) -> list[dict]:
    """offset 分页拉 toList（新服务器 pageNumber 是行偏移，不是页号）。"""
    headers = _headers(cfg, cookie)
    rows: list[dict] = []
    offset = 0
    empty_pages = 0
    while True:
        form = {
            "pageNumber": str(offset),
            "pageSize": str(PAGE_SIZE),
            "sortOrder": "asc",
            "gdData": "0",
            "queryParam": json.dumps(query_param, ensure_ascii=False),
        }
        r = requests.post(
            cfg.epms_base_url + LIST, data=form, headers=headers, timeout=120,
            verify=False, proxies={"http": None, "https": None},
        )
        r.raise_for_status()
        payload = r.json()
        if isinstance(payload, dict) and payload.get("success") is False:
            raise RuntimeError(f"toList 业务失败: {payload.get('messages') or payload.get('message')}")
        batch = payload.get("rows") or []
        if not batch:
            empty_pages += 1
            if empty_pages >= 2:
                break
            offset += PAGE_SIZE
            continue
        empty_pages = 0
        rows.extend(batch)
        offset += PAGE_SIZE
    return rows


def enrich_uuid(
    cfg: Config, cookie: str, *, excel_path: Path, out_path: Path, review_from: str, review_to: str
) -> Path:
    """拉同一审核时间范围的 toList 建索引，按「订单编号」补 uuid。"""
    query_param = _review_query_param(review_from, review_to)
    rows = _fetch_rows(cfg, cookie, query_param)
    print(f"[export] toList 拉取 {len(rows)} 条用于 uuid 索引", file=sys.stderr)

    lookup: dict[str, str] = {}
    for r in rows:
        uid = str(r.get("uuid") or "").strip()
        for field in _MATCH_FIELDS:
            v = r.get(field)
            if v is None or (isinstance(v, float) and pd.isna(v)):
                continue
            k = str(v).strip()
            if k and uid and k not in lookup:
                lookup[k] = uid

    df = pd.read_excel(excel_path)
    if "订单编号" not in df.columns:
        raise RuntimeError("导出 Excel 缺少「订单编号」列")
    df["uuid"] = df["订单编号"].map(lambda v: lookup.get(str(v).strip(), ""))
    matched = int((df["uuid"] != "").sum())
    print(f"[export] 补 uuid: {len(df)} 行，命中 {matched}", file=sys.stderr)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(out_path, index=False)
    return out_path


def export_and_enrich(
    cfg: Config, cookie: str, *, review_from: str, review_to: str, work_dir: Path
) -> Path:
    """导出 + 补 uuid，返回含 uuid 的 Excel 路径。"""
    work_dir.mkdir(parents=True, exist_ok=True)
    raw = work_dir / "orders_raw.xlsx"
    enriched = work_dir / "orders_with_uuid.xlsx"
    export_orders_excel(cfg, cookie, review_from=review_from, review_to=review_to, out_path=raw)
    return enrich_uuid(
        cfg, cookie, excel_path=raw, out_path=enriched, review_from=review_from, review_to=review_to
    )
