"""T04 切片4 测试 —— 批处理 + SHA-256 指纹去重 + FastAPI 上传入口。

真 PG（Docker 临时库）。fake MinerU/DeepSeek（不打真外部）。
断言：指纹去重、断点续跑、单份失败不阻断整批、HTTP /parse 端到端。
无 Docker 自动跳过。
"""

from __future__ import annotations

import pathlib
import subprocess
import sys
import time
import uuid

import pytest

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))
_ROOT = pathlib.Path(__file__).resolve().parents[3]
_DDL = _ROOT / "packages" / "contracts-db" / "migrations" / "001_contracts.sql"
_PACKAGES_DDL = _ROOT / "packages" / "contracts-db" / "migrations" / "003_contract_packages.sql"
_KEYWORD_DDL = _ROOT / "packages" / "contracts-db" / "migrations" / "004_configurable_keyword_hits.sql"
_FULLTEXT_DDL = _ROOT / "packages" / "contracts-db" / "migrations" / "005_fulltext_keyword_index.sql"
_MODULE_SCOPE_DDL = _ROOT / "packages" / "contracts-db" / "migrations" / "006_manual_review_and_module_scope.sql"
_SEED = _ROOT / "packages" / "contracts-db" / "seeds" / "001_dict.sql"

from jinguan_parse import (  # noqa: E402
    ingest_one, ingest_batch, file_sha256, IngestDeps,
    ModuleConfig, KeywordMatcher, ContractExtraction,
)
from jinguan_parse.schema import SummaryFields, AmountFields, CommercialFields  # noqa: E402
from fakes import FakeMineruClient, FakeExtractClient  # noqa: E402

psycopg = pytest.importorskip("psycopg")


def _have_docker() -> bool:
    try:
        return subprocess.run(["docker", "info"], capture_output=True).returncode == 0
    except FileNotFoundError:
        return False


pytestmark = pytest.mark.skipif(not _have_docker(), reason="需要 Docker 跑临时 PG")


@pytest.fixture(scope="module")
def pg():
    name = f"parse-ingest-{uuid.uuid4().hex[:8]}"
    subprocess.run(
        ["docker", "run", "-d", "--name", name, "-P",
         "-e", "POSTGRES_PASSWORD=pw", "-e", "POSTGRES_DB=contracts", "postgres:16-alpine"],
        check=True, capture_output=True,
    )
    try:
        port = subprocess.check_output(
            ["docker", "inspect", "-f",
             "{{(index (index .NetworkSettings.Ports \"5432/tcp\") 0).HostPort}}", name]
        ).decode().strip()
        dsn = f"postgresql://postgres:pw@localhost:{port}/contracts"
        conn = None
        for _ in range(30):
            try:
                conn = psycopg.connect(dsn); break
            except Exception:
                time.sleep(1)
        assert conn is not None
        with conn.cursor() as cur:
            cur.execute(_DDL.read_text(encoding="utf-8"))
            cur.execute(_PACKAGES_DDL.read_text(encoding="utf-8"))
            cur.execute(_SEED.read_text(encoding="utf-8"))
            cur.execute(_KEYWORD_DDL.read_text(encoding="utf-8"))
            cur.execute(_FULLTEXT_DDL.read_text(encoding="utf-8"))
            cur.execute(_MODULE_SCOPE_DDL.read_text(encoding="utf-8"))
        conn.commit()
        yield conn, dsn
        conn.close()
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


def _deps():
    ext = ContractExtraction(
        summary=SummaryFields(customer_name="甲", contract_name="合同", contract_type="框架"),
        amount=AmountFields(), commercial=CommercialFields(),
    )
    return IngestDeps(
        mineru=FakeMineruClient("# 合同\n## 服务内容\n智能巡检。\n"),
        extractor=FakeExtractClient(ext),
        modules=[ModuleConfig("service", "服务内容", ["服务内容"])],
        matcher=KeywordMatcher({"智能巡检": ["智能巡检"]}),
        contract_no_of=lambda draft, path: pathlib.Path(path).stem,
    )


def _make_pdfs(tmp_path, n, same_content=False):
    # tmp_path 每个测试唯一 → 用其名做 salt，避免共享 DB 里跨测试指纹碰撞
    salt = tmp_path.name
    paths = []
    for i in range(n):
        p = tmp_path / f"c{i}.pdf"
        content = b"%PDF-1.4 same" if same_content else f"%PDF-1.4 {salt} doc{i}".encode()
        p.write_bytes(content)
        paths.append(str(p))
    return paths


def test_sha256_stable(tmp_path):
    p = tmp_path / "x.pdf"; p.write_bytes(b"%PDF-1.4 abc")
    assert file_sha256(str(p)) == file_sha256(str(p))
    assert len(file_sha256(str(p))) == 64


def test_batch_ingests_distinct(pg, tmp_path):
    conn, _ = pg
    paths = _make_pdfs(tmp_path, 3)
    results = ingest_batch(conn, paths, _deps())
    assert [r.status for r in results] == ["ingested"] * 3
    assert all(r.draft_id for r in results)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM contracts_draft")
        assert cur.fetchone()[0] >= 3


def test_fingerprint_dedup(pg, tmp_path):
    conn, _ = pg
    # 同内容两份 → 第二份被指纹拦截
    a = tmp_path / "dup_a.pdf"; a.write_bytes(b"%PDF-1.4 identical")
    b = tmp_path / "dup_b.pdf"; b.write_bytes(b"%PDF-1.4 identical")
    r1 = ingest_one(conn, str(a), _deps())
    r2 = ingest_one(conn, str(b), _deps())
    assert r1.status == "ingested"
    assert r2.status == "skipped_duplicate"      # 指纹相同被跳过


def test_resume_skips_already_done(pg, tmp_path):
    conn, _ = pg
    p = _make_pdfs(tmp_path, 1)
    r1 = ingest_batch(conn, p, _deps())
    r2 = ingest_batch(conn, p, _deps())          # 断点续跑：重跑同批
    assert r1[0].status == "ingested"
    assert r2[0].status == "skipped_duplicate"


def test_failure_does_not_abort_batch(pg, tmp_path):
    conn, _ = pg
    good = _make_pdfs(tmp_path, 1)[0]
    bad = str(tmp_path / "missing.pdf")           # 不存在 → 读取失败
    results = ingest_batch(conn, [bad, good], _deps())
    statuses = {pathlib.Path(r.path).name: r.status for r in results}
    assert statuses["missing.pdf"] == "failed"
    assert statuses["c0.pdf"] == "ingested"       # 失败后仍继续处理好的
    assert results[0].error is not None


def test_http_parse_endpoint(pg, tmp_path):
    fastapi_testclient = pytest.importorskip("fastapi.testclient")
    from jinguan_parse.api import create_app
    _, dsn = pg

    app = create_app(
        lambda: psycopg.connect(dsn), _deps(),
        pdf_root=tmp_path / "pdf", markdown_root=tmp_path / "md-pdf",
    )
    client = fastapi_testclient.TestClient(app)

    assert client.get("/health").json() == {"status": "ok"}
    # 非 PDF 拒绝
    assert client.post("/parse", files={"file": ("x.txt", b"hi", "text/plain")}).status_code == 400
    # PDF 上传 → 落草稿
    import pymupdf
    doc = pymupdf.open(); doc.new_page(); valid_pdf = doc.tobytes(); doc.close()
    resp = client.post("/parse", files={"file": ("http_c.pdf", valid_pdf, "application/pdf")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ingested" and body["draft_id"]
    # 页面上传与批量导入共用 PDF→Markdown 缓存和来源映射，而不是只留临时文件。
    assert list((tmp_path / "pdf" / "uploads").rglob("*.pdf"))
    assert list((tmp_path / "md-pdf").rglob("*.md"))
    assert (tmp_path / "md-pdf" / "manifest.json").is_file()
    conn = psycopg.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT source_relative_path, markdown_path FROM contract_sources")
            source, markdown = cur.fetchone()
        assert source.startswith("uploads/") and markdown.startswith("uploads/")
    finally:
        conn.close()
