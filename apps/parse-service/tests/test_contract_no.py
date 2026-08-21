from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from jinguan_parse.contract_number import suggest_contract_no
from jinguan_parse.ingest import default_contract_no


def test_suggest_contract_no_adds_hskj_prefix_for_regular_code():
    assert suggest_contract_no("QC-2026015_某项目合同.pdf") == "HSKJ/C-QC-2026015"


def test_suggest_contract_no_keeps_special_entity_prefixes():
    assert suggest_contract_no("ZCKJ-CM-2026001.pdf") == "ZCKJ-CM-2026001"
    assert suggest_contract_no("RQKJ-RJ-2026001.pdf") == "RQKJ-RJ-2026001"
    assert suggest_contract_no("HSSL-QT-2026001.pdf") == "HSSL-QT-2026001"
    assert suggest_contract_no("JZX-QC-2026001.pdf") == "JZX-QC-2026001"


def test_suggest_contract_no_normalizes_hsslc_and_upload_hash():
    assert suggest_contract_no("HSSLC-QT-2025013--c91db63e4ccd.pdf") == "HSSL/C-QT-2025013"


def test_suggest_contract_no_returns_none_without_leading_code():
    assert suggest_contract_no("沈阳师范大学合作协议.pdf") is None


def test_default_contract_no_is_internal_draft_key_not_filename_contract_number():
    assert default_contract_no("CM-2026020_2026-2027年度设计院软件成本度量服务.pdf").startswith("DRAFT-")


def test_default_contract_no_has_milvus_safe_fallback_length():
    value = default_contract_no("合同" * 100 + ".pdf")
    assert value.startswith("DRAFT-")
    assert len(value) <= 128
