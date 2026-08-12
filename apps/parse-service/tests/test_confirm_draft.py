"""T04 第一切片测试 —— confirm_draft（草稿 → 正式库 + 展开 module_hits）。

真 PG（Docker 临时库）。插草稿 → 核对 → 断言正式行 confirmed=1 + _ai_raw 搬运
+ module_hits 展开成 contract_module_hits 行 + 草稿被删 + 正式库只存 confirmed=1。
无 Docker 自动跳过。
"""

from __future__ import annotations

import pathlib
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

import pytest

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))
_ROOT = pathlib.Path(__file__).resolve().parents[3]
_DDL = _ROOT / "packages" / "contracts-db" / "migrations" / "001_contracts.sql"
_DDL2 = _ROOT / "packages" / "contracts-db" / "migrations" / "002_contract_md_sync.sql"
_SEED = _ROOT / "packages" / "contracts-db" / "seeds" / "001_dict.sql"

from jinguan_parse import (  # noqa: E402
    extract_one_contract, ModuleConfig, KeywordMatcher, ContractExtraction,
    insert_draft, confirm_draft, DraftNotFound,
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
def pg_conn():
    name = f"parse-confirm-{uuid.uuid4().hex[:8]}"
    subprocess.run(
        ["docker", "run", "-d", "--name", name, "-P",
         "-e", "POSTGRES_PASSWORD=pw", "-e", "POSTGRES_DB=contracts",
         "postgres:16-alpine"],
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
            cur.execute(_DDL2.read_text(encoding="utf-8"))
            cur.execute(_SEED.read_text(encoding="utf-8"))
        conn.commit()
        yield conn
        conn.close()
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


def _make_draft(pg_conn, contract_no: str):
    ext = ContractExtraction(
        summary=SummaryFields(customer_name="中移物联网", contract_name="智慧工地框架",
                              contract_type="框架", sign_date="2024-05-17"),
        amount=AmountFields(amount_type="上限", amount="31522732.8元", tax_rate="6%"),
        commercial=CommercialFields(post_eval="是"),
    )
    md = "# 合同\n## 服务内容\n提供智能巡检与AIOps服务。\n## 技术要求\n边缘部署。\n"
    mods = [ModuleConfig("service", "服务内容", ["服务内容"]),
            ModuleConfig("tech", "技术要求", ["技术要求"])]
    matcher = KeywordMatcher({"智能巡检": ["智能巡检", "AIOps"]})
    draft = extract_one_contract("x.pdf", FakeMineruClient(md), FakeExtractClient(ext), mods, matcher)
    return insert_draft(pg_conn, contract_no=contract_no, draft=draft, source_sha256="sha-1")


def test_confirm_moves_draft_to_formal(pg_conn):
    draft_id = _make_draft(pg_conn, "HT-CONFIRM-0001")
    when = datetime(2026, 8, 12, tzinfo=timezone.utc)
    cid = confirm_draft(pg_conn, draft_id, confirmed_by="张三", now=when)
    assert isinstance(cid, int)

    with pg_conn.cursor() as cur:
        # 正式行：confirmed=1 + 核对留痕 + _ai_raw 搬运 + tag_ai
        cur.execute("SELECT confirmed, confirmed_by, confirmed_at, contract_type, "
                    "tag_ai, customer_name, customer_name_ai_raw, amount_ai_raw "
                    "FROM contracts WHERE id=%s", (cid,))
        confirmed, by, at, ctype, tag_ai, cust, cust_raw, amt_raw = cur.fetchone()
        assert confirmed == 1 and by == "张三" and at == when
        assert ctype == "框架" and tag_ai == 1
        assert cust == "中移物联网" and cust_raw == "中移物联网"
        assert amt_raw == "31522732.8元"           # 金额原文留痕搬运

        # module_hits 展开成行
        cur.execute("SELECT module_key, hit, keywords FROM contract_module_hits "
                    "WHERE contract_id=%s ORDER BY module_key", (cid,))
        rows = cur.fetchall()
        by_key = {r[0]: r for r in rows}
        assert set(by_key) == {"service", "tech"}
        assert by_key["service"][1] == 1                # service 命中
        assert "智能巡检" in by_key["service"][2]

        # 草稿已删（避免重复核对）
        cur.execute("SELECT count(*) FROM contracts_draft WHERE id=%s", (draft_id,))
        assert cur.fetchone()[0] == 0

        # 全文 md + md5 搬运到正式库（切片3 同步比对/重建依赖）
        cur.execute("SELECT mineru_md, mineru_md5 FROM contracts WHERE id=%s", (cid,))
        md, md5 = cur.fetchone()
        import hashlib
        assert md and "服务内容" in md
        assert md5 == hashlib.md5(md.encode("utf-8")).hexdigest()


def test_confirm_applies_overrides(pg_conn):
    draft_id = _make_draft(pg_conn, "HT-CONFIRM-0002")
    # 人工核对修正合同名 + 补手工列考核线
    cid = confirm_draft(pg_conn, draft_id, confirmed_by="李四",
                        overrides={"contract_name": "智慧工地OneNET框架采购合同", "assessment_line": "ISC"})
    with pg_conn.cursor() as cur:
        cur.execute("SELECT contract_name, assessment_line FROM contracts WHERE id=%s", (cid,))
        name, line = cur.fetchone()
    assert name == "智慧工地OneNET框架采购合同"      # override 生效
    assert line == "ISC"


def test_formal_only_confirmed(pg_conn):
    # 正式库 CHECK(confirmed=1)：confirm_draft 写的必是 confirmed=1（上面已验），
    # 这里验证直接塞 confirmed=0 进正式库会被拒
    with pytest.raises(Exception):
        with pg_conn.cursor() as cur:
            cur.execute("INSERT INTO contracts (contract_no, confirmed) VALUES ('BAD', 0)")
        pg_conn.commit()
    pg_conn.rollback()


def test_missing_draft_raises(pg_conn):
    with pytest.raises(DraftNotFound):
        confirm_draft(pg_conn, 999999, confirmed_by="王五")
    pg_conn.rollback()
