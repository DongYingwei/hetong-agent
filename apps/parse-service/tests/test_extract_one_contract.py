"""T03 验收测试 —— extract_one_contract（一份合同 → 草稿记录）。

只测外部行为：给定 MinerU markdown + DeepSeek 抽取结果（均 fake，不打真服务）→
断言草稿含 17 标量 AI 字段 + _ai_raw 留痕 + 四模块命中明细 + tag_ai 汇总正确。
关键词匹配用真实 pyahocorasick（确定性，无网络）。
"""

from __future__ import annotations

import pathlib
import sys

import pytest

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))

from jinguan_parse import (  # noqa: E402
    extract_one_contract,
    ModuleConfig,
    KeywordMatcher,
    ContractExtraction,
)
from jinguan_parse.schema import SummaryFields, AmountFields, CommercialFields  # noqa: E402

from fakes import FakeMineruClient, FakeExtractClient  # noqa: E402


# 预置四模块配置（对应 contract_modules 种子）
MODULES = [
    ModuleConfig("service", "服务内容", ["服务内容", "项目内容", "服务标的"]),
    ModuleConfig("tech", "技术要求", ["技术要求", "项目技术栈"]),
    ModuleConfig("role", "岗位说明", ["岗位说明", "岗位需求"]),
    ModuleConfig("staff", "人员需求", ["人员需求", "人员资质"]),
]

# AI 大方向词表（§6.2 结构：大方向 → 具体词）
TAXONOMY = {
    "智能巡检": ["智能巡检", "AIOps"],
    "大模型与生成式AI": ["大模型", "LLM"],
    "计算机视觉": ["计算机视觉", "OCR"],
}

# demo 合同 markdown（含四模块章节 + AI 关键词）
MD = """# 合同

## 服务内容
本项目提供智能巡检平台建设，基于大模型的缺陷识别。

## 技术要求
采用国产化服务器，支持边缘部署。

## 岗位说明
需项目经理一名。

## 人员需求
算法工程师两名，掌握计算机视觉技能。
"""


@pytest.fixture
def extraction() -> ContractExtraction:
    return ContractExtraction(
        summary=SummaryFields(
            customer_name="中国移动",
            contract_name="智能巡检平台建设合同",
            contract_type="单项",
            sign_date="2026-04-02",
        ),
        amount=AmountFields(amount_type="固定", amount="120万元", tax_rate="6%"),
        commercial=CommercialFields(post_eval="是", authorizer="张三"),
    )


@pytest.fixture
def draft(extraction):
    mineru = FakeMineruClient(MD)
    extractor = FakeExtractClient(extraction)
    matcher = KeywordMatcher(TAXONOMY)
    d = extract_one_contract("demo.pdf", mineru, extractor, MODULES, matcher)
    return d, mineru, extractor


# ── 验收 1：端到端产出草稿，confirmed=0 ──
def test_produces_draft(draft):
    d, mineru, extractor = draft
    assert d.confirmed == 0
    assert mineru.parsed == ["demo.pdf"]        # MinerU 被调用
    assert extractor.calls == [MD]              # 抽取拿到的是 MinerU 的 md


# ── 验收 2：17 标量 AI 字段齐全，键=DDL 列名 ──
def test_ai_fields_flat(draft):
    d, _, _ = draft
    assert len(d.ai_fields) == 17
    assert d.ai_fields["customer_name"] == "中国移动"
    assert d.ai_fields["contract_type"] == "单项"
    assert d.ai_fields["amount"] == "120万元"
    assert d.ai_fields["tax_rate"] == "6%"       # 税率保持文本
    # 未抽到的字段为 None（不编造）
    assert d.ai_fields["deposit_amount"] is None


# ── 验收 3：每个 AI 字段有 _ai_raw 留痕（§7.2）──
def test_ai_raw_traceability(draft):
    d, _, _ = draft
    assert len(d.ai_raw) == 17
    assert d.ai_raw["customer_name_ai_raw"] == "中国移动"
    assert set(k.replace("_ai_raw", "") for k in d.ai_raw) == set(d.ai_fields)


# ── 验收 4：四模块命中明细，每模块一行 ──
def test_module_hits(draft):
    d, _, _ = draft
    by_key = {h.module_key: h for h in d.module_hits}
    assert set(by_key) == {"service", "tech", "role", "staff"}
    # service 段含「智能巡检」「大模型」→ 命中
    svc = by_key["service"]
    assert svc.hit == 1
    assert "智能巡检" in svc.keywords and "大模型" in svc.keywords
    assert "智能巡检" in svc.category
    assert svc.raw_text and "智能巡检平台建设" in svc.raw_text
    # role 段无 AI 词 → 未命中
    assert by_key["role"].hit == 0
    assert by_key["role"].keywords is None


# ── 验收 5：tag_ai = 任一模块命中即 1（§6 汇总）──
def test_tag_ai_aggregation(draft):
    d, _, _ = draft
    assert d.tag_ai == 1  # service/tech/staff 命中


# ── 验收 6：模块缺失（锚点未命中）→ raw_text=None，hit=0，不报错 ──
def test_missing_module(extraction):
    md_no_role = MD.replace("## 岗位说明\n需项目经理一名。\n", "")
    d = extract_one_contract(
        "demo.pdf", FakeMineruClient(md_no_role), FakeExtractClient(extraction),
        MODULES, KeywordMatcher(TAXONOMY),
    )
    role = next(h for h in d.module_hits if h.module_key == "role")
    assert role.hit == 0
    assert role.raw_text is None


# ── 验收 7（配置驱动）：停用某模块 → 不产出该模块命中行 ──
def test_disabled_module_skipped(extraction):
    mods = [*MODULES[:3], ModuleConfig("staff", "人员需求", ["人员需求"], enabled=False)]
    d = extract_one_contract(
        "demo.pdf", FakeMineruClient(MD), FakeExtractClient(extraction),
        mods, KeywordMatcher(TAXONOMY),
    )
    assert "staff" not in {h.module_key for h in d.module_hits}
