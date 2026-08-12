"""HTTP 上传入口 —— T04 切片4（FastAPI，评测确认复用开源）。

单份上传即时解析入口，共用 ingest_one 核心（与批处理同一逻辑）。
真实客户端 + PG 连接在启动时装配；此模块只暴露路由。
"""

from __future__ import annotations

import tempfile

from fastapi import FastAPI, UploadFile, File, HTTPException

from .config import load_settings
from .clients import HttpMineruClient, DeepSeekExtractClient
from .ingest import IngestDeps, ingest_one
from .extract import ModuleConfig
from .keywords import KeywordMatcher


def create_app(conn_factory, deps: IngestDeps) -> FastAPI:
    """装配 app。conn_factory() → 每请求一个 psycopg 连接；deps 为注入的抽取依赖。

    连接与依赖注入 → 便于测试替换 fake 抽取 + 临时 PG。
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

    return app


def build_default_app() -> FastAPI:
    """生产装配：从 .env 读端点，接真实 MinerU/DeepSeek/PG。"""
    import psycopg

    s = load_settings(".env")
    deps = IngestDeps(
        mineru=HttpMineruClient(s),
        extractor=DeepSeekExtractClient(s),
        modules=_load_modules_from_db(s.pg_url),
        matcher=_load_matcher(),  # 词表加载待接（§6.2 台账「AI业绩关键词」）
    )
    return create_app(lambda: psycopg.connect(s.pg_url), deps)


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
