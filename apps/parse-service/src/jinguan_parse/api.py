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
from .vector import EmbeddingClient, VectorStore, vectorize_confirmed_contract
from .confirm import confirm_draft, DraftNotFound

# 核对页要展示/编辑的草稿字段（17 标量 AI 主列 + 手工列 + tag_ai）。
_DRAFT_FORM_COLS = [
    "contract_no", "assessment_line", "bid_no", "related_main_no", "framework_alias", "status",
    "customer_name", "contract_name", "customer_contract_no", "signing_entity",
    "contract_type", "sign_date", "start_date", "end_date",
    "amount_type", "amount", "tax_rate", "settlement_terms",
    "post_eval", "deposit_amount", "deposit_refund", "arbitration", "authorizer", "tag_ai",
]


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
    async def parse(file: UploadFile = File(...), force: bool = False):
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="仅接受 PDF 文件")
        # 落临时文件（MinerU 客户端按路径读）
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
            tmp.write(await file.read())
            tmp.flush()
            conn = conn_factory()
            try:
                result = ingest_one(conn, tmp.name, deps, force=force)
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
        # B2：解析成功即回带草稿字段，前端拿到 draft_id 后可直接跳核对页（也可再调 /draft）。
        if result.draft_id is not None:
            conn = conn_factory()
            try:
                payload["draft"] = _read_draft(conn, result.draft_id)
            finally:
                conn.close()
        return payload

    @app.get("/draft/{draft_id}")
    def get_draft(draft_id: int):
        """B3：读草稿全字段（AI 抽取值 + 模块命中 + 原文），供人工核对页展示。"""
        conn = conn_factory()
        try:
            draft = _read_draft(conn, draft_id)
        finally:
            conn.close()
        if draft is None:
            raise HTTPException(status_code=404, detail=f"草稿 id={draft_id} 不存在")
        return draft

    @app.post("/confirm/{draft_id}")
    def confirm(draft_id: int, body: dict = Body(default={})):
        """B4：人工核对入正式库 + 建向量。body.overrides = 人工修正的字段（列名→值）。"""
        overrides = body.get("overrides") or {}
        confirmed_by = body.get("confirmed_by") or "web-verify"
        conn = conn_factory()
        try:
            contract_id = confirm_draft(conn, draft_id, confirmed_by=confirmed_by, overrides=overrides)
        except DraftNotFound as e:
            conn.close()
            raise HTTPException(status_code=404, detail=str(e))
        # 建向量（坑9：仅正式库）。读回正式库的 mineru_md 切片建向量。
        chunks = 0
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT contract_no, mineru_md FROM contracts WHERE id = %s", (contract_id,))
                row = cur.fetchone()
            if row and row[1] and embedder is not None and store is not None:
                contract_no, markdown = row
                chunks = vectorize_confirmed_contract(
                    markdown, contract_id, contract_no, embedder, store, module_anchors)
                store.flush()
        finally:
            conn.close()
        return {"contract_id": contract_id, "chunks": chunks, "vectorized": chunks > 0}

    @app.delete("/contract/{contract_id}")
    def delete_contract(contract_id: int):
        """删除正式库合同 + 模块命中明细 + Milvus 向量（保持 PG 与向量库一致）。"""
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM contracts WHERE id = %s", (contract_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail=f"合同 id={contract_id} 不存在")
                # 模块命中有外键指向 contracts，先删明细再删主表。
                cur.execute("DELETE FROM contract_module_hits WHERE contract_id = %s", (contract_id,))
                cur.execute("DELETE FROM contracts WHERE id = %s", (contract_id,))
            conn.commit()
        finally:
            conn.close()
        # 删 Milvus 向量（坑9 一致性：删合同必删其片段，否则 RAG 仍能检索到已删合同）。
        if store is not None:
            try:
                store.delete_by_contract(contract_id)
                store.flush()
            except Exception:
                pass  # 向量删除失败不阻断 PG 删除；片段成孤儿由后续同步兜底
        return {"contract_id": contract_id, "deleted": True}

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
        matcher=_load_matcher(s),  # §6.2 台账「AI业绩关键词」词表
    )
    return create_app(
        lambda: psycopg.connect(s.pg_url), deps,
        embedder=QwenEmbeddingClient(s),
        store=MilvusVectorStore(s),
        module_anchors={m.module_key: m.anchor_names for m in deps.modules},
    )


def _read_draft(conn, draft_id: int) -> dict | None:
    """读草稿一行 → dict（表单字段 + 模块命中 + 原文预览）。不存在返回 None。"""
    cols = _DRAFT_FORM_COLS + ["module_hits", "mineru_md"]
    with conn.cursor() as cur:
        cur.execute(f"SELECT {', '.join(cols)} FROM contracts_draft WHERE id = %s", (draft_id,))
        row = cur.fetchone()
    if row is None:
        return None
    data = dict(zip(cols, row))
    # 日期/数值转成前端友好的字符串；原文只给预览（全文太大）。
    for k in ("sign_date", "start_date", "end_date"):
        if data.get(k) is not None:
            data[k] = str(data[k])
    for k in ("amount", "deposit_amount"):
        if data.get(k) is not None:
            data[k] = float(data[k])
    md = data.pop("mineru_md", None) or ""
    return {
        "draft_id": draft_id,
        "form": {c: data.get(c) for c in _DRAFT_FORM_COLS},
        "module_hits": data.get("module_hits") or [],
        # 核对页左侧展示全文（一份合同 40KB 级别，JSON + markdown 渲染可接受；截断会让合同"看起来不全"）。
        "mineru_md_preview": md,
        "mineru_md_len": len(md),
    }


def _load_modules_from_db(pg_url: str) -> list[ModuleConfig]:
    import psycopg

    with psycopg.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT module_key, name, anchor_names, enabled "
                    "FROM contract_modules WHERE enabled ORDER BY sort_order")
        return [ModuleConfig(k, n, list(a or []), e) for k, n, a, e in cur.fetchall()]


def _load_matcher(s) -> KeywordMatcher:
    """从台账「AI业绩关键词」sheet 加载 60 词表（§6.2）。文件缺失则回退空词表。

    ledger_xlsx 默认相对仓库根（demo/…）；服务从 apps/parse-service/ 起时相对路径找不到，
    故相对路径按仓库根解析（本文件 = apps/parse-service/src/jinguan_parse/api.py，上溯 4 级到根）。
    """
    import pathlib
    from .taxonomy import load_matcher

    xlsx = pathlib.Path(s.ledger_xlsx)
    if not xlsx.is_absolute():
        repo_root = pathlib.Path(__file__).resolve().parents[4]
        xlsx = repo_root / s.ledger_xlsx
    try:
        m = load_matcher(str(xlsx), s.keyword_sheet)
        print(f"[parse] 词表加载: {len(m._word_to_cat)} 词 ← {xlsx}")
        return m
    except (FileNotFoundError, KeyError) as e:
        print(f"[parse] ⚠ 词表加载失败({e})，回退空词表（模块命中恒 0）")
        return KeywordMatcher({})
