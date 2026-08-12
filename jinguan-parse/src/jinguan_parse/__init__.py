"""jinguan-parse —— 经小管合同解析模块（Python 运行时）。

与 jinguan-qa（查询侧 TS）不同运行时，仅通过共享 PostgreSQL（contracts-db）与 Milvus 耦合。
解析侧【写】，查询侧【只读】。
"""

from .chunking import Chunk, process_one_contract, build_chunks, DEFAULT_MODULE_KEYS
from .extract import (
    extract_one_contract,
    DraftContract,
    ModuleConfig,
    ModuleHit,
)
from .keywords import KeywordMatcher, KeywordHit
from .schema import ContractExtraction
from .persist import insert_draft
from .confirm import confirm_draft, DraftNotFound
from .ingest import (
    ingest_one, ingest_batch, file_sha256, IngestDeps, IngestResult,
)
from .vector import (
    vectorize_chunks, vectorize_confirmed_contract, markdown_to_segments,
    QwenEmbeddingClient, MilvusVectorStore, EMBED_DIM, COLLECTION,
)

__all__ = [
    "Chunk",
    "process_one_contract",
    "build_chunks",
    "DEFAULT_MODULE_KEYS",
    "extract_one_contract",
    "DraftContract",
    "ModuleConfig",
    "ModuleHit",
    "KeywordMatcher",
    "KeywordHit",
    "ContractExtraction",
    "insert_draft",
    "confirm_draft",
    "DraftNotFound",
    "ingest_one",
    "ingest_batch",
    "file_sha256",
    "IngestDeps",
    "IngestResult",
    "vectorize_chunks",
    "vectorize_confirmed_contract",
    "markdown_to_segments",
    "QwenEmbeddingClient",
    "MilvusVectorStore",
    "EMBED_DIM",
    "COLLECTION",
]
