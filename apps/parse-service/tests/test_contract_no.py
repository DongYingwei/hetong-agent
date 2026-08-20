from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from jinguan_parse.ingest import default_contract_no


def test_default_contract_no_is_internal_draft_key_not_filename_contract_number():
    assert default_contract_no("CM-2026020_2026-2027年度设计院软件成本度量服务.pdf").startswith("DRAFT-")


def test_default_contract_no_has_milvus_safe_fallback_length():
    value = default_contract_no("合同" * 100 + ".pdf")
    assert value.startswith("DRAFT-")
    assert len(value) <= 128
