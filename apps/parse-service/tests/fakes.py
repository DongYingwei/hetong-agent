"""记录式 fake 客户端 —— 不打真 qwen3 / Milvus（§S3 Testing Decisions）。

设计：替换真实客户端，记录被调用了什么，供测试断言。固定向量，不依赖网络。
"""

from __future__ import annotations

from typing import Any


class FakeEmbedClient:
    """固定向量的 embedding fake，记录被 embed 的文本。"""

    def __init__(self, dim: int = 8) -> None:
        self.dim = dim
        self.embedded: list[str] = []

    def embed(self, text: str) -> list[float]:
        self.embedded.append(text)
        # 固定确定性向量（与文本长度弱相关，仅为可复现，不做真实语义）
        return [float(len(text) % 7)] * self.dim


class RecordingMilvusClient:
    """记录式 Milvus fake，记录每次 upsert 的 (vector, metadata, content)。"""

    def __init__(self) -> None:
        self.writes: list[dict[str, Any]] = []

    def upsert(self, vector: list[float], metadata: dict[str, Any], content: str) -> None:
        self.writes.append({"vector": vector, "metadata": metadata, "content": content})

    @property
    def write_count(self) -> int:
        return len(self.writes)


# ── T03 fakes：不打真 MinerU / DeepSeek ──
class FakeMineruClient:
    """返回预置 Markdown 的 MinerU fake，记录被解析的 pdf 路径。"""

    def __init__(self, markdown: str) -> None:
        self.markdown = markdown
        self.parsed: list[str] = []

    def parse_pdf(self, pdf_path: str) -> str:
        self.parsed.append(pdf_path)
        return self.markdown


class FakeExtractClient:
    """返回预置 ContractExtraction 的抽取 fake（替代 DeepSeek+instructor）。"""

    def __init__(self, extraction: Any) -> None:
        self.extraction = extraction
        self.calls: list[str] = []

    def extract(self, markdown: str) -> Any:
        self.calls.append(markdown)
        return self.extraction


# ── 切片2 fakes：不打真 embedding / Milvus ──
class FakeEmbeddingClient:
    """固定维度向量的 embedding fake，记录被 embed 的批次。"""

    def __init__(self, dim: int = 2560) -> None:
        self.dim = dim
        self.batches: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.batches.append(list(texts))
        return [[float((len(t) + i) % 5)] * self.dim for i, t in enumerate(texts)]


class FakeVectorStore:
    """记录式 Milvus fake，记录 ensure/upsert/delete 调用与写入行。"""

    def __init__(self) -> None:
        self.ensured = 0
        self.rows: list[dict] = []
        self.deleted: list[int] = []
        self.meta_updates: list[tuple[int, dict]] = []

    def ensure_collection(self) -> None:
        self.ensured += 1

    def upsert_chunks(self, rows: list[dict]) -> int:
        self.rows.extend(rows)
        return len(rows)

    def delete_by_contract(self, contract_id: int) -> None:
        self.deleted.append(contract_id)

    def update_metadata_by_contract(self, contract_id: int, patch: dict) -> int:
        # 记录每次 metadata-only 更新；命中 = 当前该合同已存在的片段行
        hit = [r for r in self.rows if r.get("contract_id") == contract_id]
        for r in hit:
            r.update(patch)
        self.meta_updates.append((contract_id, dict(patch)))
        return len(hit)
