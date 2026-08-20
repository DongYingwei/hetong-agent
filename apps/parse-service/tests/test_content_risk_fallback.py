from __future__ import annotations

import pathlib
import sys

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))

from jinguan_parse.clients import QualityFallbackExtractClient  # noqa: E402
from jinguan_parse.schema import ContractExtraction, SummaryFields  # noqa: E402


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


def test_falls_back_when_primary_raises():
    fallback = ReturningExtractor("fallback-result")
    client = QualityFallbackExtractClient(
        RaisingExtractor(Exception("local model timed out")), fallback,
    )
    assert client.extract("合同正文") == "fallback-result"
    assert fallback.calls == ["合同正文"]


def test_falls_back_when_primary_has_too_few_core_fields():
    fallback = ReturningExtractor("deepseek-result")
    client = QualityFallbackExtractClient(
        ReturningExtractor(ContractExtraction(summary=SummaryFields(contract_name="合同"))), fallback,
    )
    assert client.extract("合同正文") == "deepseek-result"
    assert fallback.calls == ["合同正文"]


def test_keeps_local_result_with_two_core_fields():
    local_result = ContractExtraction(summary=SummaryFields(customer_name="甲方", contract_name="合同"))
    fallback = ReturningExtractor("unused")
    client = QualityFallbackExtractClient(ReturningExtractor(local_result), fallback)
    assert client.extract("合同正文") is local_result
    assert fallback.calls == []
