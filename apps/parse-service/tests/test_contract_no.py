from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from jinguan_parse.ingest import default_contract_no


def test_default_contract_no_prefers_contract_number_in_long_filename():
    assert default_contract_no("CM-2026020_2026-2027年度设计院软件成本度量服务.pdf") == "CM-2026020"
    assert default_contract_no("HSKJ/C-CM-2025045_框架合同.pdf") == "HSKJ/C-CM-2025045"


def test_default_contract_no_has_milvus_safe_fallback_length():
    value = default_contract_no("合同" * 100 + ".pdf")
    assert len(value) <= 128
