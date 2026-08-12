"""T02 验收测试 —— 解析侧唯一新增接缝 process_one_contract。

只测外部行为（§S3 Testing Decisions）：给一份 MinerU JSON →
断言切分片段集符合结构感知规则 + metadata 四字段齐全 + 四模块单独存 + 建向量被调用。
用 fake 客户端，不打真 MinerU / qwen3 / Milvus。
"""

from __future__ import annotations

import json
import pathlib
import sys

import pytest

# 让测试直接从源码目录导入（无需安装）
_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))

from jinguan_parse import Chunk, process_one_contract, build_chunks  # noqa: E402
from jinguan_parse.chunking import MAX_PARENT_CHARS, _split_sentences  # noqa: E402

from fakes import FakeEmbedClient, RecordingMilvusClient  # noqa: E402


FIXTURE = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "demo_mineru.json"

# 当前启用的模块（来自 contract_modules 配置；测试显式传入以体现配置驱动）
MODULE_KEYS = frozenset({"service", "tech", "role", "staff"})


@pytest.fixture
def mineru_json() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def run(mineru_json):
    embed = FakeEmbedClient()
    milvus = RecordingMilvusClient()
    chunks = process_one_contract(
        mineru_json, milvus_client=milvus, embed_client=embed, module_keys=MODULE_KEYS
    )
    return chunks, milvus, embed


# ── 验收 1：函数签名定型，input MinerU JSON → output chunk[] ──
def test_signature_returns_chunk_list(run):
    chunks, _, _ = run
    assert isinstance(chunks, list)
    assert chunks and all(isinstance(c, Chunk) for c in chunks)


# ── 验收 2a：按 field 切父块（模块段 field=module_key，非模块段=原 field）──
def test_parent_blocks_per_field(mineru_json):
    chunks = build_chunks(mineru_json, module_keys=MODULE_KEYS)
    # 期望的 field 集合：非模块段用原 field，模块段用 module_key
    expected = set()
    for seg in mineru_json["segments"]:
        mk = seg.get("module_key")
        expected.add(mk if mk in MODULE_KEYS else seg["field"])
    fields_out = {c.field for c in chunks}
    assert fields_out == expected


# ── 验收 2b：超长父块二次切（service 模块超阈值 → >1 片）──
def test_long_block_is_split(mineru_json):
    chunks = build_chunks(mineru_json, module_keys=MODULE_KEYS)
    svc = [c for c in chunks if c.field == "service"]
    # demo 的 service 模块原文明显超过 MAX_PARENT_CHARS，必须被二次切
    assert len(svc) >= 2, f"service 模块应被二次切，实得 {len(svc)} 片"
    # chunk_index 递增且从 0 起
    assert [c.chunk_index for c in svc] == list(range(len(svc)))


# ── 验收 2c：二次切片段间重叠 1 句（防条款被切断）──
def test_overlap_between_split_pieces(mineru_json):
    chunks = build_chunks(mineru_json, module_keys=MODULE_KEYS)
    svc = [c.content for c in chunks if c.field == "service"]
    assert len(svc) >= 2
    # 前一片的末句应作为后一片的首句出现（重叠）
    first_tail = _split_sentences(svc[0])[-1]
    second_head = _split_sentences(svc[1])[0]
    assert first_tail == second_head, "相邻片段应重叠至少 1 句"


# ── 验收 3：metadata 四字段齐全（§7.6.3）──
def test_metadata_four_fields(run):
    chunks, _, _ = run
    for c in chunks:
        md = c.metadata()
        assert set(md.keys()) == {"contract_id", "contract_no", "field", "module_category"}
        assert md["contract_id"] == 101
        assert md["contract_no"] == "HT-2026-0034"
        assert md["field"]  # 非空
        # module_category 可为 None（非四模块段），但键必须在


# ── 验收 4a：模块段单独存储（每个启用 module_key 有独立片段，不与他模块混）──
def test_modules_stored_separately(mineru_json):
    chunks = build_chunks(mineru_json, module_keys=MODULE_KEYS)
    for mod in MODULE_KEYS:
        mod_chunks = [c for c in chunks if c.field == mod]
        assert mod_chunks, f"模块 {mod} 应有独立片段"
        # 该模块所有片段的 field 就是该 module_key，不串味
        assert all(c.field == mod for c in mod_chunks)


# ── 验收 4b（配置驱动）：新增模块只需扩 module_keys，代码零改动 ──
def test_new_module_is_config_driven(mineru_json):
    # 原型「合同模块」可新增：给 MinerU 段挂一个新 module_key='legal'，
    # 只要把它加入启用集合，就自然被当作独立模块切分——无需改 chunking 代码。
    extended = dict(mineru_json)
    extended["segments"] = mineru_json["segments"] + [
        {"field": "法务条款", "module_key": "legal", "text": "本合同争议适用中国法律。", "module_category": None}
    ]
    chunks = build_chunks(extended, module_keys=MODULE_KEYS | {"legal"})
    legal = [c for c in chunks if c.field == "legal"]
    assert legal, "新增模块 legal 应被当作独立模块切分"
    # 若未启用该 module_key，则退化为普通 field（原文本 field 名），不当模块处理
    chunks_disabled = build_chunks(extended, module_keys=MODULE_KEYS)
    assert not [c for c in chunks_disabled if c.field == "legal"]
    assert [c for c in chunks_disabled if c.field == "法务条款"]


# ── 验收 4c：属模块的段带 module_category，非模块段为 None ──
def test_module_category_assignment(mineru_json):
    chunks = build_chunks(mineru_json, module_keys=MODULE_KEYS)
    svc = [c for c in chunks if c.field == "service"]
    assert all(c.module_category == "智能巡检" for c in svc)
    preface = [c for c in chunks if c.field == "前言"]
    assert all(c.module_category is None for c in preface)


# ── 验收 5：建向量被调用 —— fake Milvus 写入次数 == 片段数 ──
def test_vectorize_called_per_chunk(run):
    chunks, milvus, embed = run
    assert milvus.write_count == len(chunks), "每个片段应触发一次 Milvus upsert"
    assert len(embed.embedded) == len(chunks), "每个片段应生成一次 embedding"
    # 写入 Milvus 的 metadata 就是片段四字段
    for w, c in zip(milvus.writes, chunks):
        assert w["metadata"] == c.metadata()
        assert w["content"] == c.content
