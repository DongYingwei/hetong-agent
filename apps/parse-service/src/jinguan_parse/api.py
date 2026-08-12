"""HTTP 上传入口 —— T04 切片4（FastAPI，评测确认复用开源）。

单份上传即时解析入口，共用 ingest_one 核心（与批处理同一逻辑）。
真实客户端 + PG 连接在启动时装配；此模块只暴露路由。
"""

from __future__ import annotations

import tempfile

from fastapi import FastAPI, UploadFile, File, HTTPException, Body

from .config import load_settings
from .clients import HttpMineruClient, DeepSeekExtractClient
from .ingest import IngestDeps, ingest_one
from .extract import ModuleConfig
from .keywords import KeywordMatcher
from .sync import sync_source_update, sync_label_update, ContractNotFound
from .vector import EmbeddingClient, VectorStore


def create_app(conn_factory, deps: IngestDeps,
               embedder: EmbeddingClient | None = None,
               store: VectorStore | None = None,
               module_anchors: dict[str, list[str]] | None = None) -> FastAPI:
    """装配 app。conn_factory() → 每请求一个 psycopg 连接；deps 为注入的抽取依赖。

    embedder/store 供 /sync 片段同步（切片3）；缺省时 /sync 返回 503。
    连接与依赖注入 → 便于测试替换 fake 抽取/向量 + 临时 PG。
    """
    app = FastAPI(title="jinguan-parse", description="合同解析上传入口")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/parse")
    async def parse(file: UploadFile = File(...)):
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="仅接受 PDF 文件")
        # 落临时文件（MinerU 客户端按路径读）
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
            tmp.write(await file.read())
            tmp.flush()
            conn = conn_factory()
            try:
                result = ingest_one(conn, tmp.name, deps)
            finally:
                conn.close()
        payload = {
            "path": file.filename,
            "status": result.status,
            "draft_id": result.draft_id,
            "error": result.error,
        }
        if result.status == "failed":
            raise HTTPException(status_code=500, detail=payload)
        return payload

    @app.post("/sync/{contract_id}/source")
    async def sync_source(contract_id: int, file: UploadFile = File(...)):
        """原文重传：比 MD5 决定是否重建向量（切片3）。"""
        if embedder is None or store is None:
            raise HTTPException(status_code=503, detail="向量端点未配置，无法同步")
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="仅接受 PDF 文件")
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
            tmp.write(await file.read())
            tmp.flush()
            markdown = deps.mineru.parse_pdf(tmp.name)
        conn = conn_factory()
        try:
            r = sync_source_update(conn, contract_id, markdown, embedder, store,
                                   module_anchors=module_anchors)
        except ContractNotFound as e:
            raise HTTPException(status_code=404, detail=str(e))
        finally:
            conn.close()
        return {"contract_id": r.contract_id, "action": r.action, "chunks": r.chunks}

    @app.post("/sync/{contract_id}/labels")
    def sync_labels(contract_id: int, patch: dict = Body(...)):
        """只改标签/关键字：更新片段 metadata，不重算向量（切片3）。"""
        if store is None:
            raise HTTPException(status_code=503, detail="向量端点未配置，无法同步")
        conn = conn_factory()
        try:
            r = sync_label_update(conn, contract_id, patch, store)
        except ContractNotFound as e:
            raise HTTPException(status_code=404, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            conn.close()
        return {"contract_id": r.contract_id, "action": r.action, "chunks": r.chunks}

    return app


def build_default_app() -> FastAPI:
    """生产装配：从 .env 读端点，接真实 MinerU/DeepSeek/PG。"""
    import psycopg

    from .vector import QwenEmbeddingClient, MilvusVectorStore

    s = load_settings(".env")
    deps = IngestDeps(
        mineru=HttpMineruClient(s),
        extractor=DeepSeekExtractClient(s),
        modules=_load_modules_from_db(s.pg_url),
        matcher=_load_matcher(),  # 词表加载待接（§6.2 台账「AI业绩关键词」）
    )
    return create_app(
        lambda: psycopg.connect(s.pg_url), deps,
        embedder=QwenEmbeddingClient(s),
        store=MilvusVectorStore(s),
    )


def _load_modules_from_db(pg_url: str) -> list[ModuleConfig]:
    import psycopg

    with psycopg.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT module_key, name, anchor_names, enabled "
                    "FROM contract_modules WHERE enabled ORDER BY sort_order")
        return [ModuleConfig(k, n, list(a or []), e) for k, n, a, e in cur.fetchall()]


def _load_matcher() -> KeywordMatcher:
    # TODO(T04 后续)：从台账「AI业绩关键词」sheet 或字典表加载 60 词表。
    # 首版空词表占位——真实词表接入前，模块命中恒为未命中。
    return KeywordMatcher({})
