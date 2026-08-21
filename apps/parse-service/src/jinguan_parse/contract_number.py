"""合同号建议值——从上传文件名前置编码生成，供人工核对确认。

草稿内部主键仍使用 ``DRAFT-*``，不把未核对数据当成正式合同号；本模块只生成
可在核对页自动带出的建议值。所有上传入口均经 ``ingest_one``，因此规则只有一个入口。
"""

from __future__ import annotations

import re
from pathlib import Path


_UPLOAD_HASH_SUFFIX = re.compile(r"--[0-9a-f]{12,}$", re.IGNORECASE)
_LEADING_CONTRACT_CODE = re.compile(
    r"^\s*((?:[A-Za-z]+(?:/[A-Za-z]+)?-)?[A-Za-z]+-\d{4,}(?:-\d+)?)"
)
_NO_HSKJ_PREFIX = ("ZCKJ-", "RQKJ-", "HSSL-", "HSSL/C-", "JZX-")


def suggest_contract_no(source_name: str) -> str | None:
    """从文件/合同包名称的开头提取编码并规范化，无法识别时返回 ``None``。

    普通编码补 ``HSKJ/C-``；ZCKJ、RQKJ、HSSL、JZX 保留原主体前缀；历史
    ``HSSLC-`` 编码规范化为 ``HSSL/C-``。
    """
    stem = _UPLOAD_HASH_SUFFIX.sub("", Path(source_name).stem).upper()
    match = _LEADING_CONTRACT_CODE.match(stem)
    if match is None:
        return None
    code = match.group(1)
    if code.startswith("HSSLC-"):
        return f"HSSL/C-{code[len('HSSLC-'):]}"
    if code.startswith("HSKJ/C-") or code.startswith(_NO_HSKJ_PREFIX):
        return code
    return f"HSKJ/C-{code}"
