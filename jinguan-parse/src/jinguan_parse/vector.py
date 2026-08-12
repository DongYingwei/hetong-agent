"""建向量 —— T04 切片2：embedding（Qwen3, OpenAI 兼容 vLLM）+ 写 Milvus（pymilvus）。

契约（真调确认 2026-08-12）：
  · embedding: POST /v1/embeddings（vLLM OpenAI 兼容），Qwen3-Embedding-4B，**2560 维**。
  · Milvus: 本地 standalone v2.4.5，localhost:19530。collection metadata 四字段（§7.6.3）。

设计：两个客户端是深模块，小接口后藏 HTTP/Milvus 细节；依赖注入 → 测试用 fake，不打真服务。
时机（§7.6.4 / 坑9）：仅核对入正式库(confirmed=1)后建向量；草稿区不建。
"""

from __future__ import annotations

from typing import Protocol

from openai import OpenAI

from .chunking import Chunk, build_chunks
from .config import Settings

EMBED_DIM = 2560  # Qwen3-Embedding-4B（真调确认）
COLLECTION = "contract_chunks"


# ─────────────────────────────────────────────────────────────
# embedding 客户端（OpenAI 兼容 vLLM）
# ─────────────────────────────────────────────────────────────
class EmbeddingClient(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class QwenEmbeddingClient:
    """Qwen3-Embedding-4B（vLLM /v1/embeddings，OpenAI 兼容）。批量 embed。"""

    def __init__(self, settings: Settings, openai_client: object | None = None) -> None:
        self._model = settings.embed_model
        self._client = openai_client or OpenAI(base_url=settings.embed_base_url + "/v1",
                                               api_key="not-needed")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = self._client.embeddings.create(model=self._model, input=texts)
        # 按 index 排序，保证与输入顺序一致
        items = sorted(resp.data, key=lambda d: d.index)
        return [list(it.embedding) for it in items]


# ─────────────────────────────────────────────────────────────
# Milvus 写入客户端（pymilvus）
# ─────────────────────────────────────────────────────────────
class VectorStore(Protocol):
    def ensure_collection(self) -> None: ...
    def upsert_chunks(self, rows: list[dict]) -> int: ...
    def delete_by_contract(self, contract_id: int) -> None: ...
    def update_metadata_by_contract(self, contract_id: int, patch: dict) -> int: ...


class MilvusVectorStore:
    """Milvus collection contract_chunks：向量 + metadata 四字段（§7.6.3）。

    schema：id(auto) · vector(2560) · contract_id · contract_no · field · module_category · content。
    contract_id/field/module_category 建标量索引，支撑 T07 混合检索的标量过滤。
    """

    def __init__(self, settings: Settings, client: object | None = None) -> None:
        self._uri = settings.milvus_uri
        self._client = client  # 允许注入（测试/复用）；否则 ensure_collection 时惰性建

    def _c(self):
        if self._client is None:
            from pymilvus import MilvusClient

            self._client = MilvusClient(uri=self._uri)
        return self._client

    def ensure_collection(self) -> None:
        from pymilvus import DataType

        client = self._c()
        if client.has_collection(COLLECTION):
            return
        schema = client.create_schema(auto_id=True, enable_dynamic_field=False)
        schema.add_field("id", DataType.INT64, is_primary=True)
        schema.add_field("vector", DataType.FLOAT_VECTOR, dim=EMBED_DIM)
        schema.add_field("contract_id", DataType.INT64)
        schema.add_field("contract_no", DataType.VARCHAR, max_length=128)
        schema.add_field("field", DataType.VARCHAR, max_length=128)
        schema.add_field("module_category", DataType.VARCHAR, max_length=128)
        schema.add_field("content", DataType.VARCHAR, max_length=65535)

        index = client.prepare_index_params()
        index.add_index(field_name="vector", index_type="AUTOINDEX", metric_type="COSINE")
        client.create_collection(COLLECTION, schema=schema, index_params=index)

    def upsert_chunks(self, rows: list[dict]) -> int:
        if not rows:
            return 0
        client = self._c()
        client.insert(collection_name=COLLECTION, data=rows)
        return len(rows)

    def delete_by_contract(self, contract_id: int) -> None:
        """原文更新/重建时按合同清旧片段（§7.6.5，切片3 会用）。"""
        client = self._c()
        client.delete(collection_name=COLLECTION, filter=f"contract_id == {contract_id}")

    _META_FIELDS = ("contract_no", "field", "module_category")

    def update_metadata_by_contract(self, contract_id: int, patch: dict) -> int:
        """只改标签/关键字：更新该合同全部片段的 metadata，不重算 embedding（§7.6.5）。

        Milvus 无「就地改标量列」原语——取回该合同现有行（含向量），套用 patch 后
        原样 upsert（auto_id 主键 → insert 即 upsert 语义按 id）。仅允许改 metadata 字段。
        返回受影响片段数。
        """
        bad = set(patch) - set(self._META_FIELDS)
        if bad:
            raise ValueError(f"update_metadata 仅可改 metadata 字段，非法：{sorted(bad)}")
        client = self._c()
        rows = client.query(
            collection_name=COLLECTION,
            filter=f"contract_id == {contract_id}",
            output_fields=["id", "vector", "contract_id", "contract_no",
                           "field", "module_category", "content"],
        )
        if not rows:
            return 0
        for r in rows:
            r.update(patch)
        client.upsert(collection_name=COLLECTION, data=rows)
        return len(rows)


# ─────────────────────────────────────────────────────────────
# 建向量编排：Chunk[] → embedding → 写 Milvus
# ─────────────────────────────────────────────────────────────
def markdown_to_segments(markdown: str, contract_id: int, contract_no: str,
                         module_anchors: dict[str, list[str]] | None = None) -> dict:
    """MinerU markdown → T02 build_chunks 期望的 segments 结构。

    按 Markdown 标题(#)切段：每个标题及其正文为一 segment，field=标题文本。
    若标题命中某模块的锚点变体，则挂 module_key（供四模块单独存）。
    首版切段策略简单，结构感知的父块/超长二切/重叠在 build_chunks 里做（§7.6.2）。
    """
    anchors = module_anchors or {}
    lines = markdown.splitlines()
    segments: list[dict] = []
    cur_title = "前言"
    cur_body: list[str] = []

    def flush():
        text = "\n".join(cur_body).strip()
        if not text:
            return
        mod_key = None
        for mk, variants in anchors.items():
            if any(v in cur_title for v in variants):
                mod_key = mk
                break
        segments.append({"field": cur_title, "module_key": mod_key,
                         "module_category": None, "text": text})

    for ln in lines:
        if ln.lstrip().startswith("#"):
            flush()
            cur_title = ln.lstrip("#").strip() or "正文"
            cur_body = []
        else:
            cur_body.append(ln)
    flush()
    return {"contract_id": contract_id, "contract_no": contract_no, "segments": segments}


def vectorize_confirmed_contract(
    markdown: str,
    contract_id: int,
    contract_no: str,
    embedder: EmbeddingClient,
    store: VectorStore,
    module_anchors: dict[str, list[str]] | None = None,
) -> int:
    """核对入正式库后：全文 markdown → 切片(T02) → 建向量写 Milvus（坑9：仅正式库）。"""
    mineru_json = markdown_to_segments(markdown, contract_id, contract_no, module_anchors)
    module_keys = set((module_anchors or {}).keys()) or None
    chunks = build_chunks(mineru_json, module_keys=module_keys)
    return vectorize_chunks(chunks, embedder, store)


def vectorize_chunks(
    chunks: list[Chunk],
    embedder: EmbeddingClient,
    store: VectorStore,
) -> int:
    """把已切分片段建向量并写入 Milvus。返回写入条数。

    仅应在合同核对入正式库后调用（坑9）。metadata 四字段来自 Chunk。
    """
    if not chunks:
        return 0
    store.ensure_collection()
    vectors = embedder.embed([c.content for c in chunks])
    rows = [
        {
            "vector": vec,
            "contract_id": c.contract_id,
            "contract_no": c.contract_no,
            "field": c.field,
            "module_category": c.module_category or "",
            "content": c.content,
        }
        for c, vec in zip(chunks, vectors)
    ]
    return store.upsert_chunks(rows)
