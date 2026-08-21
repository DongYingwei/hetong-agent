from pathlib import Path
import sys

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from epms_sync.order_ledger import build_order_rows, norm_order_no  # noqa: E402


def test_norm_order_no_matches_attachment_directory_convention():
    assert norm_order_no("HSKJ/C-RJ-2026001") == "HSKJ_C-RJ-2026001"


def test_build_order_rows_uses_incremental_ai_result(tmp_path):
    excel = tmp_path / "orders.xlsx"
    pd.DataFrame([{
        "订单编号": "HSKJ/C-RJ-2026001", "客户线": "运营商", "项目名称": "智能项目",
        "收入确认标记": "已确认", "uuid": "u-1", "订单含税总额": 100.5,
    }]).to_excel(excel, index=False)
    rows = build_order_rows(excel, {
        "HSKJ_C-RJ-2026001": {"verdict": "是", "hits": ["AI", "大模型"], "md_files": ["1.md"]},
    })
    assert len(rows) == 1
    row = rows[0]
    assert row["order_no"] == "HSKJ/C-RJ-2026001"
    assert row["assessment_line"] == "运营商"
    assert row["income_confirmed"] == 1
    assert row["tag_ai"] == 1 and row["hit_keyword"] == "AI"
    assert row["ai_keywords"] == ["AI", "大模型"] and row["attachment_count"] == 1
