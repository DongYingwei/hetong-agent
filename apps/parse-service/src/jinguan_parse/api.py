"""HTTP 上传入口 —— T04 切片4（FastAPI，评测确认复用开源）。

单份上传即时解析入口，共用 ingest_one 核心（与批处理同一逻辑）。
真实客户端 + PG 连接在启动时装配；此模块只暴露路由。
"""

from __future__ import annotations

import tempfile
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import FileResponse

from .config import load_settings
from .clients import HttpMineruClient, DeepSeekExtractClient, ContentRiskFallbackExtractClient
from .ingest import IngestDeps, ingest_one
from .extract import ModuleConfig
from .keywords import KeywordMatcher
from .sync import sync_source_update, sync_label_update, ContractNotFound
from .vector import EmbeddingClient, VectorStore, vectorize_confirmed_contract
from .confirm import confirm_draft, DraftNotFound
from .keyword_scan import ScanKeyword, ScanModule, scan_markdown, scan_fulltext_markdown, split_module_paragraphs
from .pdf_markdown_cache import convert_pdf
from .pdf_page_limit import first_pages_for_parse
from .upload_storage import persist_pdf_upload, persist_upload

# 核对页要展示/编辑的草稿字段（17 标量 AI 主列 + 手工列 + tag_ai）。
_DRAFT_FORM_COLS = [
    "contract_no", "assessment_line", "bid_no", "related_main_no", "framework_alias", "status",
    "customer_name", "contract_name", "customer_contract_no", "signing_entity",
    "contract_type", "sign_date", "start_date", "end_date",
    "amount_type", "amount", "tax_rate", "settlement_terms",
    "post_eval", "deposit_amount", "deposit_refund", "arbitration", "authorizer", "tag_ai",
]

_ARCHIVE_ALLOWED_SUFFIXES = {".pdf", ".doc", ".docx"}
_ARCHIVE_MAX_FILES = 200
_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024  # 1 GiB，防 ZIP 炸弹
_CONTRACT_PARSE_PAGE_LIMIT = 50


def _extract_contract_zip(content: bytes, archive_name: str) -> list[tuple[str, bytes]]:
    """安全展开一个合同 ZIP 包，只返回可处理的合同附件。"""
    try:
        archive = zipfile.ZipFile(BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail=f"合同压缩包无效：{archive_name}") from exc
    extracted: list[tuple[str, bytes]] = []
    total_size = 0
    with archive:
        for info in archive.infolist():
            raw_path = Path(info.filename)
            if info.is_dir():
                continue
            # 禁止绝对路径和 ../，避免 Zip Slip 覆盖服务器任意文件。
            if raw_path.is_absolute() or ".." in raw_path.parts:
                raise HTTPException(status_code=400, detail="合同压缩包包含非法路径")
            if raw_path.suffix.lower() not in _ARCHIVE_ALLOWED_SUFFIXES:
                continue
            if len(extracted) >= _ARCHIVE_MAX_FILES:
                raise HTTPException(status_code=400, detail=f"合同压缩包最多包含 {_ARCHIVE_MAX_FILES} 个 PDF/Word 文件")
            total_size += info.file_size
            if total_size > _ARCHIVE_MAX_UNCOMPRESSED_BYTES:
                raise HTTPException(status_code=400, detail="合同压缩包解压后超过 1GB 限制")
            extracted.append((raw_path.name, archive.read(info)))
    if not extracted:
        raise HTTPException(status_code=400, detail="合同压缩包中未找到 PDF、DOC 或 DOCX 文件")
    return extracted


def create_app(conn_factory, deps: IngestDeps,
               embedder: EmbeddingClient | None = None,
               store: VectorStore | None = None,
               module_anchors: dict[str, list[str]] | None = None,
               pdf_root: str | Path | None = None,
               markdown_root: str | Path | None = None) -> FastAPI:
    """装配 app。conn_factory() → 每请求一个 psycopg 连接；deps 为注入的抽取依赖。

    embedder/store 供 /sync 片段同步（切片3）；缺省时 /sync 返回 503。
    连接与依赖注入 → 便于测试替换 fake 抽取/向量 + 临时 PG。
    """
    app = FastAPI(title="jinguan-parse", description="合同解析上传入口")
    repo_root = Path(__file__).resolve().parents[4]
    source_root = Path(pdf_root or repo_root / "data" / "pdf").resolve()
    md_root = Path(markdown_root or repo_root / "data" / "md-file").resolve()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/parse")
    def parse(file: UploadFile = File(...), force: bool = False):
        """在线程池执行耗时解析，不能阻塞健康检查和关键词管理。"""
        extraction_page_limit = _CONTRACT_PARSE_PAGE_LIMIT
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="仅接受 PDF 文件")
        # 上传文件先落持久原件目录，再复用或生成与批量导入完全相同的 md-pdf 缓存。
        # 不能以临时文件作为唯一来源，否则核对完成后无法预览、下载和追溯。
        try:
            pdf_path, relative_path, sha = persist_pdf_upload(
                file.file.read(), file.filename, source_root,
            )
            conn = conn_factory()
            try:
                duplicate = _existing_source(conn, sha)
            finally:
                conn.close()
            # 已确认的同一原件永远只保留一个合同包；force 仅允许重建尚未核对的草稿。
            if duplicate and (not force or duplicate["contract_id"] is not None):
                return {
                    "path": file.filename,
                    "status": "skipped_duplicate",
                    "draft_id": duplicate["draft_id"],
                    "contract_id": duplicate["contract_id"],
                    "error": None,
                }

            with first_pages_for_parse(pdf_path, extraction_page_limit) as parse_pdf:
                _, markdown_path = convert_pdf(
                    parse_pdf.path, md_root, deps.mineru, source_root=source_root,
                    markdown_relative_path=relative_path,
                    cache_key=f"{sha}:first-{parse_pdf.parsed_pages}-pages",
                    source_file=pdf_path, force=force,
                )
            markdown = markdown_path.read_text(encoding="utf-8")
            conn = conn_factory()
            try:
                result = ingest_one(
                    conn, str(pdf_path), deps, force=force, markdown=markdown,
                    extraction_context=markdown,
                )
                if result.status == "ingested" and result.draft_id is not None:
                    _register_uploaded_source(
                        conn, result.draft_id, sha, relative_path,
                        markdown_path.relative_to(md_root).as_posix(), markdown,
                    )
            finally:
                conn.close()
        except Exception as exc:
            raise HTTPException(status_code=500, detail={"error": f"上传存储或解析失败: {type(exc).__name__}: {exc}"}) from exc
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

    @app.post("/parse-package")
    def parse_package(files: list[UploadFile] = File(...), force: bool = False):
        """在线程池解析合同包，避免大文件处理独占 ASGI 事件循环。"""
        if not files:
            raise HTTPException(status_code=400, detail="未接收到合同文件")
        extraction_page_limit = _CONTRACT_PARSE_PAGE_LIMIT
        package_key = f"upload-package:{uuid.uuid4().hex}"
        sources: list[dict] = []
        pdfs: list[tuple[Path, str, str]] = []
        try:
            expanded_files: list[tuple[str, bytes]] = []
            for upload in files:
                name = upload.filename or "contract.pdf"
                suffix = Path(name).suffix.lower()
                content = upload.file.read()
                if suffix == ".zip":
                    expanded_files.extend(_extract_contract_zip(content, name))
                elif suffix in _ARCHIVE_ALLOWED_SUFFIXES:
                    expanded_files.append((name, content))
                else:
                    raise HTTPException(status_code=400, detail=f"不支持的附件格式：{name}")
            for name, content in expanded_files:
                suffix = Path(name).suffix.lower()
                path, relative_path, sha = persist_upload(content, name, source_root)
                source = {"path": path, "relative_path": relative_path, "sha": sha,
                          "source_type": suffix[1:], "markdown_path": None, "markdown": None}
                if suffix == ".pdf":
                    with first_pages_for_parse(path, extraction_page_limit) as parse_pdf:
                        _, markdown_path = convert_pdf(
                            parse_pdf.path, md_root, deps.mineru, source_root=source_root,
                            markdown_relative_path=relative_path,
                            cache_key=f"{sha}:first-{parse_pdf.parsed_pages}-pages",
                            source_file=path, force=force,
                        )
                    markdown = markdown_path.read_text(encoding="utf-8")
                    source["markdown_path"] = markdown_path.relative_to(md_root).as_posix()
                    source["markdown"] = markdown
                    pdfs.append((path, relative_path, sha))
                sources.append(source)
            if not pdfs:
                raise HTTPException(status_code=400, detail="合同包至少需要一份 PDF 用于解析")
            merged_markdown = "\n\n".join(
                f"# 附件：{Path(source['relative_path']).name}\n\n{source['markdown']}"
                for source in sources if source["markdown"]
            )
            conn = conn_factory()
            try:
                result = ingest_one(
                    conn, str(pdfs[0][0]), deps, force=force, markdown=merged_markdown,
                    extraction_context=merged_markdown,
                )
                if result.status == "ingested" and result.draft_id is not None:
                    _register_uploaded_package(conn, result.draft_id, package_key, sources)
            finally:
                conn.close()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail={"error": f"合同包上传或解析失败: {type(exc).__name__}: {exc}"}) from exc
        payload = {"path": ", ".join(Path(source["relative_path"]).name for source in sources),
                   "status": result.status, "draft_id": result.draft_id, "error": result.error}
        if result.status == "failed":
            raise HTTPException(status_code=500, detail=payload)
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

    @app.get("/draft/{draft_id}/source-files")
    def get_draft_source_files(draft_id: int):
        """草稿核对阶段列出合同包内全部 PDF，供人工逐份查看。"""
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("""SELECT cs.id, cs.source_relative_path, cs.role
                                 FROM contract_packages cp
                                 JOIN contract_sources cs ON cs.package_id=cp.id
                                WHERE cp.draft_id=%s AND cs.source_type='pdf'
                                ORDER BY CASE WHEN cs.role='primary' THEN 0 ELSE 1 END, cs.id""", (draft_id,))
                rows = cur.fetchall()
        finally:
            conn.close()
        return {"list": [{"id": row[0], "name": Path(row[1]).name, "role": row[2]} for row in rows]}

    @app.get("/draft/{draft_id}/original-pdf")
    def get_draft_original_pdf(draft_id: int, source_id: int | None = None):
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                if source_id is None:
                    cur.execute("""SELECT cs.source_relative_path FROM contract_packages cp
                                     JOIN contract_sources cs ON cs.package_id=cp.id
                                    WHERE cp.draft_id=%s AND cs.source_type='pdf'
                                    ORDER BY CASE WHEN cs.role='primary' THEN 0 ELSE 1 END, cs.id LIMIT 1""", (draft_id,))
                else:
                    cur.execute("""SELECT cs.source_relative_path FROM contract_packages cp
                                     JOIN contract_sources cs ON cs.package_id=cp.id
                                    WHERE cp.draft_id=%s AND cs.source_type='pdf' AND cs.id=%s LIMIT 1""", (draft_id, source_id))
                row = cur.fetchone()
        finally:
            conn.close()
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="该草稿未关联原始 PDF")
        pdf = (source_root / row[0]).resolve()
        if source_root not in pdf.parents or not pdf.is_file():
            raise HTTPException(status_code=404, detail="已关联的原始 PDF 文件不存在")
        return FileResponse(pdf, media_type="application/pdf", filename=pdf.name, content_disposition_type="inline")

    @app.get("/contract/{contract_id}/source-files")
    def get_source_files(contract_id: int):
        """列出合同包中可预览的 PDF；详情页可切换附件但不会暴露磁盘路径。"""
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("""SELECT cs.id, cs.source_relative_path, cs.role
                                 FROM contract_packages cp
                                 JOIN contract_sources cs ON cs.package_id=cp.id
                                WHERE cp.contract_id=%s AND cs.source_type='pdf'
                                ORDER BY CASE WHEN cs.role='primary' THEN 0 ELSE 1 END, cs.id""", (contract_id,))
                rows = cur.fetchall()
        finally:
            conn.close()
        return {"list": [{"id": r[0], "name": Path(r[1]).name, "role": r[2]} for r in rows]}

    @app.get("/contract/{contract_id}/original-pdf")
    def get_original_pdf(contract_id: int, source_id: int | None = None):
        """按已确认合同关联的 source 路径返回原始 PDF，供人工核对直接预览。"""
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                if source_id is None:
                    cur.execute("""SELECT cs.source_relative_path FROM contract_packages cp
                                     JOIN contract_sources cs ON cs.package_id=cp.id
                                    WHERE cp.contract_id=%s AND cs.source_type='pdf'
                                    ORDER BY CASE WHEN cs.role='primary' THEN 0 ELSE 1 END, cs.id LIMIT 1""", (contract_id,))
                else:
                    cur.execute("""SELECT cs.source_relative_path FROM contract_packages cp
                                     JOIN contract_sources cs ON cs.package_id=cp.id
                                    WHERE cp.contract_id=%s AND cs.source_type='pdf' AND cs.id=%s LIMIT 1""", (contract_id, source_id))
                row = cur.fetchone()
        finally:
            conn.close()
        if not row or not row[0]:
            raise HTTPException(status_code=404, detail="该合同未关联原始 PDF")
        pdf = (source_root / row[0]).resolve()
        if source_root not in pdf.parents or not pdf.is_file():
            raise HTTPException(status_code=404, detail="已关联的原始 PDF 文件不存在")
        return FileResponse(pdf, media_type="application/pdf", filename=pdf.name, content_disposition_type="inline")

    @app.post("/contract/{contract_id}/review")
    def mark_contract_reviewed(contract_id: int, body: dict = Body(default={})):
        """人工保存核对后才变为“已核对”；不改变正式入库和向量状态。"""
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM contracts WHERE id=%s", (contract_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="合同不存在")
                cur.execute("""INSERT INTO contract_manual_reviews(contract_id,status,reviewed_by,reviewed_at,updated_at)
                               VALUES (%s,1,%s,now(),now())
                               ON CONFLICT(contract_id) DO UPDATE SET status=1, reviewed_by=EXCLUDED.reviewed_by,
                                 reviewed_at=EXCLUDED.reviewed_at, updated_at=now()""",
                            (contract_id, body.get("reviewed_by") or "web-verify"))
            conn.commit()
            return {"contract_id": contract_id, "status": 1}
        finally:
            conn.close()

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
        # 关键词扫描属于台账确定性规则，不依赖向量；正式入库后立即写命中明细。
        _rescan_contract(conn, contract_id)
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

    # ── 关键词管理（唯一事实来源：contracts 库） ──────────────────────
    @app.get("/keyword-config")
    def list_keywords():
        conn = conn_factory()
        try:
            return {"list": _list_keywords(conn)}
        finally:
            conn.close()

    @app.post("/keyword-config")
    def create_keyword(body: dict = Body(...)):
        name = str(body.get("keyword_name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="关键词名称不能为空")
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO ai_keywords(name, match_rules, enabled) VALUES (%s,%s,%s) RETURNING id",
                            (name, body.get("match_rules") or "", _as_bool(body.get("status", 1))))
                kid = cur.fetchone()[0]
            conn.commit()
            return {"id": kid}
        finally:
            conn.close()

    @app.put("/keyword-config/{keyword_id}")
    def update_keyword(keyword_id: int, body: dict = Body(...)):
        # 前端状态使用 0/1，数据库 enabled 是 boolean；在传给 COALESCE 前统一类型，
        # 否则 PostgreSQL 会报 smallint 与 boolean 无法合并。
        enabled = _as_bool(body["status"]) if "status" in body else None
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("UPDATE ai_keywords SET name=COALESCE(%s,name), match_rules=COALESCE(%s,match_rules), enabled=COALESCE(%s,enabled), updated_at=now() WHERE id=%s",
                            (body.get("keyword_name"), body.get("match_rules"), enabled, keyword_id))
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="关键词不存在")
            conn.commit()
            return {"id": keyword_id}
        finally:
            conn.close()

    @app.delete("/keyword-config/{keyword_id}")
    def delete_keyword(keyword_id: int):
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM ai_keywords WHERE id=%s", (keyword_id,))
            conn.commit()
            return {"id": keyword_id}
        finally:
            conn.close()

    @app.post("/keyword-config/{keyword_id}/terms")
    def add_terms(keyword_id: int, body: dict = Body(...)):
        terms = body.get("sub_words") or body.get("sub_word") or []
        if isinstance(terms, str):
            terms = [terms]
        terms = [str(t).strip() for t in terms if str(t).strip()]
        if not terms:
            raise HTTPException(status_code=400, detail="子词不能为空")
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                for term in terms:
                    cur.execute("INSERT INTO ai_keyword_terms(keyword_id,term) VALUES (%s,%s) ON CONFLICT DO NOTHING", (keyword_id, term))
            conn.commit()
            return {"added": len(terms)}
        finally:
            conn.close()

    @app.delete("/keyword-config/{keyword_id}/terms/{term}")
    def remove_term(keyword_id: int, term: str):
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM ai_keyword_terms WHERE keyword_id=%s AND term=%s", (keyword_id, term))
            conn.commit()
            return {"removed": term}
        finally:
            conn.close()

    @app.get("/modules")
    def list_modules():
        conn = conn_factory()
        try:
            return {"list": _list_modules(conn)}
        finally:
            conn.close()

    @app.post("/modules")
    def create_module(body: dict = Body(...)):
        name = str(body.get("name") or body.get("sectionTitle") or "").strip()
        anchors = body.get("anchor_names") or body.get("subNames") or []
        if isinstance(anchors, str):
            anchors = [x.strip() for x in anchors.replace("，", ",").split(",") if x.strip()]
        if not name or not anchors:
            raise HTTPException(status_code=400, detail="模块名称和对应合同内模块名称不能为空")
        key = str(body.get("module_key") or f"custom_{uuid.uuid4().hex[:12]}")
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                scope = body.get("scope") if body.get("scope") in {"contract", "order", "all"} else "all"
                cur.execute("INSERT INTO contract_modules(module_key,name,anchor_names,recognition_rule,enabled,sort_order,scope) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                            (key, name, anchors, body.get("recognition_rule") or body.get("rulesDesc"), _as_bool(body.get("enabled", True)), int(body.get("sort_order", 99)), scope))
            conn.commit()
            return {"module_key": key}
        finally:
            conn.close()

    @app.put("/modules/{module_key}")
    def update_module(module_key: str, body: dict = Body(...)):
        anchors = body.get("anchor_names") or body.get("subNames")
        if isinstance(anchors, str):
            anchors = [x.strip() for x in anchors.replace("，", ",").split(",") if x.strip()]
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("""UPDATE contract_modules SET name=COALESCE(%s,name), anchor_names=COALESCE(%s,anchor_names),
                               recognition_rule=COALESCE(%s,recognition_rule), enabled=COALESCE(%s,enabled),
                               scope=COALESCE(%s,scope)
                               WHERE module_key=%s""",
                            (body.get("name") or body.get("sectionTitle"), anchors,
                             body.get("recognition_rule") or body.get("rulesDesc"),
                             _as_bool(body["enabled"] if "enabled" in body else body["status"]) if ("enabled" in body or "status" in body) else None,
                             body.get("scope") if body.get("scope") in {"contract", "order", "all"} else None,
                             module_key))
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="模块不存在")
            conn.commit()
            return {"module_key": module_key}
        finally:
            conn.close()

    @app.post("/contracts/rescan-keywords")
    def rescan_keywords(body: dict = Body(default={})):
        conn = conn_factory()
        try:
            ids = body.get("contract_ids")
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM contracts" + (" WHERE id = ANY(%s)" if ids else ""), (ids,) if ids else ())
                contract_ids = [row[0] for row in cur.fetchall()]
            for contract_id in contract_ids:
                _rescan_contract(conn, contract_id, bool(body.get("overwrite_manual", False)))
            conn.commit()
            return {"contracts": len(contract_ids)}
        finally:
            conn.close()

    @app.get("/contract/{contract_id}/keyword-hits")
    def get_keyword_hits(contract_id: int):
        conn = conn_factory()
        try:
            return {"list": _effective_keyword_hits(conn, contract_id)}
        finally:
            conn.close()

    @app.put("/contract/{contract_id}/keyword-overrides")
    def save_keyword_override(contract_id: int, body: dict = Body(...)):
        module_key, keyword_id, action = body.get("module_key"), body.get("keyword_id"), body.get("action")
        if not module_key or not keyword_id or action not in {"include", "exclude"}:
            raise HTTPException(status_code=400, detail="module_key、keyword_id、action(include/exclude) 必填")
        conn = conn_factory()
        try:
            with conn.cursor() as cur:
                cur.execute("""INSERT INTO contract_keyword_overrides(contract_id,module_key,keyword_id,action,updated_by)
                               VALUES (%s,%s,%s,%s,%s)
                               ON CONFLICT(contract_id,module_key,keyword_id) DO UPDATE
                               SET action=EXCLUDED.action, updated_by=EXCLUDED.updated_by, updated_at=now()""",
                            (contract_id, module_key, keyword_id, action, body.get("updated_by")))
            _refresh_contract_summary(conn, contract_id)
            conn.commit()
            return {"contract_id": contract_id, "module_key": module_key, "keyword_id": keyword_id, "action": action}
        finally:
            conn.close()

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
        try:
            pdf_path, relative_path, sha = persist_pdf_upload(
                await file.read(), file.filename, source_root,
            )
            extraction_page_limit = _CONTRACT_PARSE_PAGE_LIMIT
            with first_pages_for_parse(pdf_path, extraction_page_limit) as parse_pdf:
                _, markdown_path = convert_pdf(
                    parse_pdf.path, md_root, deps.mineru, source_root=source_root,
                    markdown_relative_path=relative_path,
                    cache_key=f"{sha}:first-{parse_pdf.parsed_pages}-pages",
                    source_file=pdf_path,
                )
            markdown = markdown_path.read_text(encoding="utf-8")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"原文件存储或解析失败: {exc}") from exc
        conn = conn_factory()
        try:
            r = sync_source_update(conn, contract_id, markdown, embedder, store,
                                   module_anchors=module_anchors)
            _register_confirmed_source(
                conn, contract_id, sha, relative_path,
                markdown_path.relative_to(md_root).as_posix(), markdown,
            )
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


def _existing_source(conn, sha: str) -> dict[str, int | None] | None:
    """按原件指纹查草稿/正式合同，避免重复上传再次解析。"""
    with conn.cursor() as cur:
        cur.execute("""SELECT cp.draft_id, cp.contract_id
                         FROM contract_sources cs
                         JOIN contract_packages cp ON cp.id=cs.package_id
                        WHERE cs.source_sha256=%s
                        ORDER BY CASE WHEN cp.contract_id IS NULL THEN 0 ELSE 1 END
                        LIMIT 1""", (sha,))
        row = cur.fetchone()
    return {"draft_id": row[0], "contract_id": row[1]} if row else None


def _register_uploaded_source(conn, draft_id: int, sha: str, source_relative_path: str,
                              markdown_path: str, markdown: str) -> None:
    """把网页上传文件登记成一个合同包，供核对后无缝转为正式合同来源。"""
    import hashlib

    package_key = f"upload:{sha}"
    markdown_sha256 = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO contract_packages(package_key, primary_source_path, draft_id, status)
                       VALUES (%s,%s,%s,'draft')
                       ON CONFLICT(package_key) DO UPDATE
                         SET primary_source_path=EXCLUDED.primary_source_path,
                             draft_id=EXCLUDED.draft_id, status='draft'
                       RETURNING id""", (package_key, source_relative_path, draft_id))
        package_id = cur.fetchone()[0]
        cur.execute("""INSERT INTO contract_sources
                         (package_id,source_sha256,source_relative_path,source_type,markdown_path,markdown_sha256,role)
                       VALUES (%s,%s,%s,'pdf',%s,%s,'primary')
                       ON CONFLICT(package_id,source_relative_path) DO UPDATE
                         SET source_sha256=EXCLUDED.source_sha256, markdown_path=EXCLUDED.markdown_path,
                             markdown_sha256=EXCLUDED.markdown_sha256, role='primary'""",
                    (package_id, sha, source_relative_path, markdown_path, markdown_sha256))
    conn.commit()


def _register_uploaded_package(conn, draft_id: int, package_key: str, sources: list[dict]) -> None:
    """将同一次多文件上传登记为同一合同包；首个 PDF 为主原件，其余均为附件。"""
    import hashlib

    primary = next(source for source in sources if source["source_type"] == "pdf")
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO contract_packages(package_key, primary_source_path, draft_id, status)
                       VALUES (%s,%s,%s,'draft') RETURNING id""",
                    (package_key, primary["relative_path"], draft_id))
        package_id = cur.fetchone()[0]
        for source in sources:
            markdown = source["markdown"]
            markdown_sha = hashlib.sha256(markdown.encode("utf-8")).hexdigest() if markdown else None
            role = "primary" if source is primary else "attachment"
            cur.execute("""INSERT INTO contract_sources
                             (package_id,source_sha256,source_relative_path,source_type,markdown_path,markdown_sha256,role)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                        (package_id, source["sha"], source["relative_path"], source["source_type"],
                         source["markdown_path"], markdown_sha, role))
    conn.commit()


def _register_confirmed_source(conn, contract_id: int, sha: str, source_relative_path: str,
                               markdown_path: str, markdown: str) -> None:
    """原文重传后更新正式合同的主原件，保留其余附件记录。"""
    import hashlib

    markdown_sha256 = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM contract_packages WHERE contract_id=%s", (contract_id,))
        row = cur.fetchone()
        if row is None:
            cur.execute("""INSERT INTO contract_packages(package_key, primary_source_path, contract_id,
                                                           status, confirmed_at)
                           VALUES (%s,%s,%s,'confirmed',now()) RETURNING id""",
                        (f"contract:{contract_id}", source_relative_path, contract_id))
            package_id = cur.fetchone()[0]
        else:
            package_id = row[0]
            cur.execute("UPDATE contract_packages SET primary_source_path=%s WHERE id=%s",
                        (source_relative_path, package_id))
            cur.execute("UPDATE contract_sources SET role='attachment' WHERE package_id=%s AND role='primary'",
                        (package_id,))
        cur.execute("""INSERT INTO contract_sources
                         (package_id,source_sha256,source_relative_path,source_type,markdown_path,markdown_sha256,role)
                       VALUES (%s,%s,%s,'pdf',%s,%s,'primary')
                       ON CONFLICT(package_id,source_relative_path) DO UPDATE
                         SET source_sha256=EXCLUDED.source_sha256, markdown_path=EXCLUDED.markdown_path,
                             markdown_sha256=EXCLUDED.markdown_sha256, role='primary'""",
                    (package_id, sha, source_relative_path, markdown_path, markdown_sha256))
    conn.commit()


def build_default_app() -> FastAPI:
    """生产装配：从 .env 读端点，接真实 MinerU/DeepSeek/PG。"""
    import psycopg

    from .vector import QwenEmbeddingClient, MilvusVectorStore

    s = load_settings(".env")
    deps = IngestDeps(
        mineru=HttpMineruClient(s),
        extractor=ContentRiskFallbackExtractClient(
            DeepSeekExtractClient(s),
            DeepSeekExtractClient(s.model_copy(update={
                "llm_base_url": s.llm_fallback_base_url,
                "llm_model": s.llm_fallback_model,
                "llm_api_key": s.llm_fallback_api_key,
            })),
        ),
        modules=_load_modules_from_db(s.pg_url),
        matcher=_load_matcher(s),  # §6.2 台账「AI业绩关键词」词表
    )
    return create_app(
        lambda: psycopg.connect(s.pg_url), deps,
        embedder=QwenEmbeddingClient(s),
        store=MilvusVectorStore(s),
        module_anchors={m.module_key: m.anchor_names for m in deps.modules},
        pdf_root=s.pdf_root,
        markdown_root=s.markdown_root,
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
    # 草稿核对页也使用当前数据库配置预览，避免仍展示旧 Excel 词表的结果。
    modules, keywords = _scan_config(conn)
    grouped: dict[str, set[str]] = {m.key: set() for m in modules}
    for hit in scan_markdown(md, modules, keywords):
        if hit.module_key in grouped:
            parent = next((k.name for k in keywords if k.id == hit.keyword_id), None)
            if parent:
                grouped[hit.module_key].add(parent)
    data["module_hits"] = [
        {"module_key": m.key, "hit": 1 if grouped[m.key] else 0,
         "keywords": ",".join(sorted(grouped[m.key])) or None, "category": None,
         "raw_text": None}
        for m in modules
    ]
    data["tag_ai"] = 1 if any(grouped.values()) else 0
    return {
        "draft_id": draft_id,
        "form": {c: data.get(c) for c in _DRAFT_FORM_COLS},
        "module_hits": data.get("module_hits") or [],
        # 核对页左侧展示全文（一份合同 40KB 级别，JSON + markdown 渲染可接受；截断会让合同"看起来不全"）。
        "mineru_md_preview": md,
        "mineru_md_len": len(md),
    }


def _list_modules(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT module_key,name,anchor_names,recognition_rule,enabled,sort_order,scope FROM contract_modules ORDER BY sort_order,module_key")
        return [
            {"module_key": r[0], "name": r[1], "anchor_names": list(r[2] or []),
             "recognition_rule": r[3], "enabled": r[4], "sort_order": r[5], "scope": r[6]}
            for r in cur.fetchall()
        ]


def _as_bool(value) -> bool:
    return str(value).strip().lower() not in {"0", "false", "off", "no", ""}


def _list_keywords(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("""SELECT k.id,k.name,k.match_rules,k.enabled,COALESCE(array_agg(t.term ORDER BY t.term)
                        FILTER (WHERE t.term IS NOT NULL), '{}')
                        FROM ai_keywords k LEFT JOIN ai_keyword_terms t ON t.keyword_id=k.id
                        GROUP BY k.id,k.name,k.match_rules,k.enabled ORDER BY k.id DESC""")
        return [{"id": r[0], "keyword_name": r[1], "match_rules": r[2] or "—",
                 "status": 1 if r[3] else 0, "sub_words": list(r[4] or []), "sub_count": len(r[4] or [])}
                for r in cur.fetchall()]


def _scan_config(conn) -> tuple[list[ScanModule], list[ScanKeyword]]:
    modules = [ScanModule(x["module_key"], x["name"], tuple(x["anchor_names"]))
               for x in _list_modules(conn) if x["enabled"]]
    keywords = [ScanKeyword(x["id"], x["keyword_name"], tuple(x["sub_words"]))
                for x in _list_keywords(conn) if x["status"] == 1]
    return modules, keywords


def _rescan_contract(conn, contract_id: int, overwrite_manual: bool = False) -> None:
    """重扫仅重建确定性命中，不触及 Markdown、chunk 或 Milvus。"""
    with conn.cursor() as cur:
        cur.execute("SELECT mineru_md FROM contracts WHERE id=%s", (contract_id,))
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="合同不存在")
        markdown = row[0] or ""
        if overwrite_manual:
            cur.execute("DELETE FROM contract_keyword_overrides WHERE contract_id=%s", (contract_id,))
        cur.execute("DELETE FROM contract_keyword_hits WHERE contract_id=%s AND source IN ('automatic','fulltext')", (contract_id,))
    modules, keywords = _scan_config(conn)
    # 全文索引用于完整性审计，默认不向页面返回；分段命中才进入台账 AI 列。
    fulltext_hits = scan_fulltext_markdown(markdown, keywords)
    # 仅已归属四类配置模块的命中才是可见的台账命中。未归属段落已由
    # fulltext_hits 留作隐藏全文索引，不能以 automatic 形式泄露或影响统计。
    hits = [hit for hit in scan_markdown(markdown, modules, keywords) if hit.module_key is not None]
    with conn.cursor() as cur:
        for hit in fulltext_hits:
            cur.execute("""INSERT INTO contract_keyword_hits
                           (contract_id,module_key,keyword_id,matched_term,paragraph_no,paragraph_text,source)
                           VALUES (%s,%s,%s,%s,%s,%s,'fulltext') ON CONFLICT DO NOTHING""",
                        (contract_id, hit.module_key, hit.keyword_id, hit.matched_term, hit.paragraph_no, hit.paragraph_text))
        for hit in hits:
            cur.execute("""INSERT INTO contract_keyword_hits
                           (contract_id,module_key,keyword_id,matched_term,paragraph_no,paragraph_text,source)
                           VALUES (%s,%s,%s,%s,%s,%s,'automatic') ON CONFLICT DO NOTHING""",
                        (contract_id, hit.module_key, hit.keyword_id, hit.matched_term, hit.paragraph_no, hit.paragraph_text))
    _refresh_contract_summary(conn, contract_id, markdown, modules)


def _effective_keyword_hits(conn, contract_id: int) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("""SELECT h.module_key,k.id,k.name,h.matched_term,h.paragraph_no,h.paragraph_text,h.source,
                              o.action
                       FROM contract_keyword_hits h JOIN ai_keywords k ON k.id=h.keyword_id
                       LEFT JOIN contract_keyword_overrides o
                         ON o.contract_id=h.contract_id AND o.module_key IS NOT DISTINCT FROM h.module_key AND o.keyword_id=h.keyword_id
                       WHERE h.contract_id=%s AND h.source <> 'fulltext'
                       ORDER BY h.module_key NULLS LAST,k.name,h.paragraph_no""", (contract_id,))
        rows = [dict(zip(("module_key", "keyword_id", "keyword_name", "matched_term", "paragraph_no", "paragraph_text", "source", "override"), r)) for r in cur.fetchall()]
        # 被人工排除的不作为有效命中；人工 include 即使原无自动命中也要回传核对页。
        effective = [r for r in rows if r["override"] != "exclude"]
        existing = {(r["module_key"], r["keyword_id"]) for r in effective}
        cur.execute("""SELECT o.module_key,k.id,k.name FROM contract_keyword_overrides o
                       JOIN ai_keywords k ON k.id=o.keyword_id
                       WHERE o.contract_id=%s AND o.action='include'""", (contract_id,))
        for module_key, keyword_id, keyword_name in cur.fetchall():
            if (module_key, keyword_id) not in existing:
                effective.append({"module_key": module_key, "keyword_id": keyword_id,
                                  "keyword_name": keyword_name, "matched_term": None,
                                  "paragraph_no": None, "paragraph_text": None,
                                  "source": "manual", "override": "include"})
        return effective


def _refresh_contract_summary(conn, contract_id: int, markdown: str | None = None,
                              modules: list[ScanModule] | None = None) -> None:
    """把精确命中折叠为台账列所需的父词集合，并重新计算 contracts.tag_ai。"""
    if modules is None:
        modules, _ = _scan_config(conn)
    if markdown is None:
        with conn.cursor() as cur:
            cur.execute("SELECT mineru_md FROM contracts WHERE id=%s", (contract_id,))
            markdown = (cur.fetchone() or [""])[0] or ""
    module_text: dict[str, list[str]] = {m.key: [] for m in modules}
    for module_key, _, text in split_module_paragraphs(markdown, modules):
        if module_key in module_text:
            module_text[module_key].append(text)
    effective = _effective_keyword_hits(conn, contract_id)
    grouped: dict[str, set[str]] = {m.key: set() for m in modules}
    for row in effective:
        if row["module_key"] in grouped:
            grouped[row["module_key"]].add(row["keyword_name"])
    # 人工 include 没有自动原文命中时同样进入台账汇总。
    with conn.cursor() as cur:
        cur.execute("""SELECT o.module_key,k.name FROM contract_keyword_overrides o
                       JOIN ai_keywords k ON k.id=o.keyword_id
                       WHERE o.contract_id=%s AND o.action='include'""", (contract_id,))
        for key, name in cur.fetchall():
            if key in grouped:
                grouped[key].add(name)
        for module in modules:
            names = sorted(grouped[module.key])
            cur.execute("""INSERT INTO contract_module_hits(contract_id,module_key,hit,keywords,category,raw_text,raw_text_ai_raw)
                           VALUES (%s,%s,%s,%s,%s,%s,%s)
                           ON CONFLICT(contract_id,module_key) DO UPDATE SET
                             hit=EXCLUDED.hit, keywords=EXCLUDED.keywords, category=EXCLUDED.category,
                             raw_text=EXCLUDED.raw_text, raw_text_ai_raw=EXCLUDED.raw_text_ai_raw""",
                        (contract_id, module.key, 1 if names else 0,
                         ",".join(names) or None, ",".join(names) or None,
                         "\n".join(module_text[module.key]) or None,
                         "\n".join(module_text[module.key]) or None))
        cur.execute("UPDATE contracts SET tag_ai=%s WHERE id=%s", (1 if any(grouped.values()) else 0, contract_id))


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
