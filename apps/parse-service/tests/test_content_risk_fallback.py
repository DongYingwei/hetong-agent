from __future__ import annotations

import pathlib
import sys

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))

from jinguan_parse.clients import ContentRiskFallbackExtractClient  # noqa: E402


class RaisingExtractor:
    def __init__(self, error: Exception):
        self.error = error

    def extract(self, markdown: str):
        raise self.error


class ReturningExtractor:
    def __init__(self, value):
        self.value = value
        self.calls: list[str] = []

    def extract(self, markdown: str):
        self.calls.append(markdown)
        return self.value


def test_falls_back_only_for_content_exists_risk():
    fallback = ReturningExtractor("fallback-result")
    client = ContentRiskFallbackExtractClient(
        RaisingExtractor(Exception("Error code: 400 - Content Exists Risk")), fallback,
    )
    assert client.extract("合同正文") == "fallback-result"
    assert fallback.calls == ["合同正文"]


def test_keeps_non_content_risk_errors_visible():
    client = ContentRiskFallbackExtractClient(
        RaisingExtractor(Exception("connection refused")), ReturningExtractor("unused"),
    )
    try:
        client.extract("合同正文")
    except Exception as exc:
        assert "connection refused" in str(exc)
    else:
        raise AssertionError("非内容风控错误不应触发本地模型兜底")
