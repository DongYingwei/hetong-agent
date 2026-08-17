"""从 .eml 提取正文和可解析的内嵌附件，避免空正文邮件丢失订单证据。"""

from __future__ import annotations

import re
from email import policy
from email.parser import BytesParser
from html import unescape
from pathlib import Path
from tempfile import TemporaryDirectory

_TAG_RE = re.compile(r"<[^>]+>")


def html_to_plain(html: str) -> str:
    t = _TAG_RE.sub(" ", html)
    return unescape(re.sub(r"\s+", " ", t)).strip()


def eml_to_text(path: Path, cfg=None) -> str:
    """解析正文；同时提取 PDF/Office/文本内嵌附件，图片交给 MinerU（有配置时）。"""
    with path.open("rb") as f:
        msg = BytesParser(policy=policy.default).parse(f)

    chunks: list[str] = []
    with TemporaryDirectory(prefix="epms_eml_") as tmp:
      tmp_dir = Path(tmp)
      attachment_no = 0
      if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            ctype = (part.get_content_type() or "").lower()
            filename = part.get_filename()
            disposition = (part.get_content_disposition() or "").lower()
            if filename or disposition == "attachment":
                raw = part.get_payload(decode=True)
                if not raw:
                    continue
                attachment_no += 1
                safe_name = Path(filename or f"attachment_{attachment_no}").name
                target = tmp_dir / safe_name
                target.write_bytes(raw)
                try:
                    from . import attachment_text, pdf_text, mineru_client
                    if target.suffix.lower() == ".pdf":
                        extracted = pdf_text.pdf_to_markdown(target)
                    elif attachment_text.is_plain_attachment(target):
                        extracted = attachment_text.extract_plain_attachment_text(target)
                    elif cfg is not None and target.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}:
                        extracted = mineru_client.parse_file_to_markdown(target, cfg.mineru_base_url)
                    else:
                        extracted = ""
                    if extracted.strip():
                        chunks.append(f"## 邮件内嵌附件：{safe_name}\n\n{extracted}")
                except Exception:  # 单个附件失败不影响邮件正文
                    continue
                continue
            try:
                payload = part.get_content()
            except Exception:  # noqa: BLE001
                continue
            if payload is None:
                continue
            if ctype == "text/plain":
                chunks.append(str(payload))
            elif ctype == "text/html":
                chunks.append(html_to_plain(str(payload)))
      else:
        try:
            payload = msg.get_content()
        except Exception:  # noqa: BLE001
            payload = None
        if payload is not None:
            ctype = (msg.get_content_type() or "").lower()
            if ctype == "text/html":
                chunks.append(html_to_plain(str(payload)))
            else:
                chunks.append(str(payload))

    return "\n".join(c for c in chunks if c.strip())
