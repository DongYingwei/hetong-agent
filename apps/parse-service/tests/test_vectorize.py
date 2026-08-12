"""T04 切片2 测试 —— vectorize_chunks（片段 → embedding → 写 Milvus）。

分两层：
  · 单元：fake embedder + fake store，验编排/metadata/建集合时机/顺序。
  · 集成：真 Milvus(localhost:19530) + 真 embedding(.33:8008)，可达才跑，否则跳过。
"""

from __future__ import annotations

import pathlib
import sys

import pytest

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))

from jinguan_parse import (  # noqa: E402
    vectorize_chunks, vectorize_confirmed_contract, markdown_to_segments,
    EMBED_DIM, COLLECTION, Chunk,
)
from fakes import FakeEmbeddingClient, FakeVectorStore  # noqa: E402


def _chunks():
    return [
        Chunk(contract_id=101, contract_no="HT-1", field="service",
              module_category="智能巡检", content="智能巡检平台建设", chunk_index=0),
        Chunk(contract_id=101, contract_no="HT-1", field="settlement_terms",
              module_category=None, content="按季度结算", chunk_index=0),
    ]


# ── 单元层（fakes）──
def test_vectorize_writes_all_chunks():
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    n = vectorize_chunks(_chunks(), emb, store)
    assert n == 2
    assert store.ensured == 1                     # 建集合被调用一次
    assert len(store.rows) == 2
    assert emb.batches == [["智能巡检平台建设", "按季度结算"]]  # 批量 embed


def test_vectorize_metadata_four_fields():
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    vectorize_chunks(_chunks(), emb, store)
    r0 = store.rows[0]
    assert set(r0) == {"vector", "contract_id", "contract_no", "field", "module_category", "content"}
    assert r0["contract_id"] == 101 and r0["contract_no"] == "HT-1"
    assert r0["field"] == "service" and r0["module_category"] == "智能巡检"
    assert len(r0["vector"]) == EMBED_DIM
    # 非模块段 module_category 为 None → 存空串（Milvus VARCHAR 不接受 None）
    assert store.rows[1]["module_category"] == ""


def test_vectorize_empty_noop():
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    assert vectorize_chunks([], emb, store) == 0
    assert store.ensured == 0 and not store.rows


# ── markdown → 切片 → 建向量（核对后路径）──
_MD = """# 前言
本合同由甲乙双方签订。
## 服务内容
提供智能巡检平台建设与运维服务。
## 结算条款
按季度结算，每季度末提交结算单。
"""


def test_markdown_to_segments_and_modules():
    seg = markdown_to_segments(_MD, 101, "HT-1", module_anchors={"service": ["服务内容"]})
    fields = {s["field"]: s for s in seg["segments"]}
    assert "服务内容" in fields and fields["服务内容"]["module_key"] == "service"
    assert fields["前言"]["module_key"] is None


def test_vectorize_confirmed_contract_path():
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    n = vectorize_confirmed_contract(_MD, 101, "HT-1", emb, store,
                                     module_anchors={"service": ["服务内容"]})
    assert n >= 3                                  # 前言 + 服务内容 + 结算条款
    # 服务内容段的 chunk field=module_key
    svc = [r for r in store.rows if r["field"] == "service"]
    assert svc and svc[0]["contract_id"] == 101


# ── 集成层（真 embedding + 真 Milvus）──
def _endpoint_up(url: str) -> bool:
    import httpx
    try:
        httpx.get(url, timeout=4)
        return True
    except Exception:
        return False


@pytest.mark.skipif(
    not _endpoint_up("http://192.168.121.33:8008/v1/models")
    or not _endpoint_up("http://localhost:9091/healthz"),
    reason="需真 embedding(.33:8008) + 真 Milvus(localhost:19530)",
)
def test_real_embedding_and_milvus():
    from jinguan_parse import QwenEmbeddingClient, MilvusVectorStore
    from jinguan_parse.config import load_settings
    from pymilvus import MilvusClient

    s = load_settings(".env")
    # 独立测试 collection，避免污染
    import jinguan_parse.vector as V
    orig = V.COLLECTION
    V.COLLECTION = "test_contract_chunks_slice2"
    try:
        client = MilvusClient(uri=s.milvus_uri)
        if client.has_collection(V.COLLECTION):
            client.drop_collection(V.COLLECTION)
        emb = QwenEmbeddingClient(s)
        store = MilvusVectorStore(s, client=client)
        n = vectorize_chunks(_chunks(), emb, store)
        assert n == 2
        client.flush(V.COLLECTION)
        stats = client.get_collection_stats(V.COLLECTION)
        assert int(stats["row_count"]) >= 2
        # 真 embedding 维度 == 2560
        vec = emb.embed(["测试"])[0]
        assert len(vec) == EMBED_DIM
        client.drop_collection(V.COLLECTION)
    finally:
        V.COLLECTION = orig
