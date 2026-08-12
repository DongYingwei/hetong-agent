"""外部服务客户端 —— MinerU / DeepSeek 抽取。

设计（codebase-design）：客户端是深模块，小接口后藏 HTTP/LLM 细节。
依赖【接受而非创建】：调用方注入真实或 fake 客户端；测试注入 fake，不打真服务。
端点封在此、从 config 读（S2/S3）。
"""

from __future__ import annotations

from typing import Protocol

import httpx
import instructor
from openai import OpenAI

from .config import Settings
from .schema import ContractExtraction


# ─────────────────────────────────────────────────────────────
# MinerU：PDF → Markdown（结构化 md_content）
# ─────────────────────────────────────────────────────────────
class MineruClient(Protocol):
    def parse_pdf(self, pdf_path: str) -> str:
        """返回 MinerU 的 md_content（带格式结构化 Markdown）。"""
        ...


class HttpMineruClient:
    """真实 MinerU HTTP 客户端（POST /file_parse，backend=vlm-http-client）。"""

    def __init__(self, settings: Settings, http: httpx.Client | None = None) -> None:
        self._s = settings
        self._http = http or httpx.Client(timeout=settings.mineru_timeout_s)

    def parse_pdf(self, pdf_path: str) -> str:
        """POST /file_parse（multipart）→ 返回 markdown。

        契约照 MinerU OpenAPI：字段名 `files`（数组）、`backend`/`return_md` 为 form 字段。
        `vlm-http-client` 需 server_url（openai 兼容 VLM 服务）；未配置时可用 `pipeline`。
        """
        url = self._s.mineru_base_url.rstrip("/") + self._s.mineru_parse_path
        data: dict[str, str] = {"backend": self._s.mineru_backend, "return_md": "true"}
        if getattr(self._s, "mineru_server_url", ""):
            data["server_url"] = self._s.mineru_server_url
        with open(pdf_path, "rb") as f:
            resp = self._http.post(
                url,
                data=data,
                files={"files": (pdf_path.split("/")[-1], f, "application/pdf")},
            )
        resp.raise_for_status()
        payload = resp.json()
        # vlm-http-client 返回任务信封（results[<stem>].md_content 可能为空，需回 result_url 取）。
        try:
            return _extract_md(payload)
        except ValueError:
            result_url = payload.get("result_url") if isinstance(payload, dict) else None
            if not result_url:
                raise
            rr = self._http.get(result_url)
            rr.raise_for_status()
            return _extract_md(rr.json())


def _extract_md(data: object) -> str:
    """从 MinerU 响应里取 markdown。响应结构随版本变化，宽容地深挖常见键。"""
    md_keys = ("md_content", "markdown", "md", "content")

    def dig(obj: object) -> str | None:
        if isinstance(obj, str):
            return None
        if isinstance(obj, dict):
            for k in md_keys:
                v = obj.get(k)
                if isinstance(v, str) and v.strip():
                    return v
            for v in obj.values():
                r = dig(v)
                if r:
                    return r
        if isinstance(obj, list):
            for v in obj:
                r = dig(v)
                if r:
                    return r
        return None

    md = dig(data)
    if md:
        return md
    keys = list(data)[:12] if isinstance(data, dict) else type(data).__name__
    raise ValueError(f"MinerU 响应无 markdown 字段：{keys}")


# ─────────────────────────────────────────────────────────────
# DeepSeek 抽取：Markdown → ContractExtraction（instructor 强制 Pydantic）
# ─────────────────────────────────────────────────────────────
class ExtractClient(Protocol):
    def extract(self, markdown: str) -> ContractExtraction: ...


_EXTRACT_SYSTEM = (
    "你是合同信息抽取助手。从给定合同全文 Markdown 中，严格按 schema 抽取字段。"
    "找不到的字段留空（null），不要编造。日期原样输出为字符串，金额原样输出（含单位/文字）。"
    "税率若有多个全列出。合同类型只能是：框架/单项/补充/解除/变更协议 之一。"
)


class DeepSeekExtractClient:
    """真实 DeepSeek 抽取（OpenAI 兼容端点 + instructor 结构化）。"""

    def __init__(self, settings: Settings, openai_client: object | None = None) -> None:
        self._model = settings.llm_model
        base = openai_client or OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
        # DeepSeek thinking-mode 模型不支持 tool_choice（函数调用）→ 用 JSON 模式（response_format）。
        self._client = instructor.from_openai(base, mode=instructor.Mode.JSON)

    def extract(self, markdown: str) -> ContractExtraction:
        return self._client.chat.completions.create(
            model=self._model,
            response_model=ContractExtraction,
            max_retries=2,  # instructor 自动重试直到满足 schema
            messages=[
                {"role": "system", "content": _EXTRACT_SYSTEM},
                {"role": "user", "content": markdown},
            ],
        )
