"""持久化网页上传的合同原件，并复用统一的 PDF → Markdown 缓存。"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from datetime import datetime
from pathlib import Path


def persist_pdf_upload(content: bytes, original_name: str, pdf_root: str | Path,
                       now: datetime | None = None) -> tuple[Path, str, str]:
    """保存上传文件，返回 ``(绝对路径, 相对路径, sha256)``。

    存储路径和批量导入保持同一规则：以 ``pdf_root`` 为源根目录，按上传年月分层，
    文件名带内容指纹。因此同内容重复上传不会产生第二份原件。
    """
    root = Path(pdf_root).resolve()
    instant = now or datetime.now()
    sha = hashlib.sha256(content).hexdigest()
    safe_stem = _safe_stem(original_name)
    relative = Path("uploads") / f"{instant:%Y}" / f"{instant:%m}" / f"{safe_stem}--{sha[:12]}.pdf"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)

    if not target.exists():
        temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(content)
            # 写完再检查，避免异常或调用方传入错误内容时留下错误的映射。
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != sha:
                raise ValueError("上传文件写入后的 SHA-256 校验失败")
            try:
                os.link(temporary, target)
            except FileExistsError:
                pass  # 并发上传同一文件，另一请求已先落盘。
            finally:
                temporary.unlink(missing_ok=True)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
    return target, relative.as_posix(), sha


def _safe_stem(original_name: str) -> str:
    name = Path(original_name).name
    stem = Path(name).stem
    value = re.sub(r"[^\w.\-一-龥]+", "_", stem, flags=re.UNICODE).strip("_.")
    return value or "contract"
