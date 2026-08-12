"""T03 落库集成测试 —— DraftContract → contracts_draft（真 PG，Docker 临时库）。

用 fake MinerU/DeepSeek 产出 DraftContract（不打真外部服务），但落库打【真 PG】——
临时 Docker Postgres，应用 contracts-db migration + seed，断言草稿行 + JSONB 模块命中。
无 Docker 时自动跳过。
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import time
import uuid

import pytest

_SRC = pathlib.Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(_SRC))
_ROOT = pathlib.Path(__file__).resolve().parents[2]  # repo root
_DDL = _ROOT / "contracts-db" / "migrations" / "001_contracts.sql"
_SEED = _ROOT / "contracts-db" / "seeds" / "001_dict.sql"

from jinguan_parse import extract_one_contract, ModuleConfig, KeywordMatcher, ContractExtraction  # noqa: E402
from jinguan_parse.schema import SummaryFields, AmountFields, CommercialFields  # noqa: E402
from jinguan_parse.persist import insert_draft  # noqa: E402
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
    name = f"parse-persist-{uuid.uuid4().hex[:8]}"
    subprocess.run(
        ["docker", "run", "-d", "--name", name, "-P",
         "-e", "POSTGRES_PASSWORD=pw", "-e", "POSTGRES_DB=contracts",
         "postgres:16-alpine"],
        check=True, capture_output=True,
    )
    try:
        # 取映射端口
        port = subprocess.check_output(
            ["docker", "inspect", "-f",
             "{{(index (index .NetworkSettings.Ports \"5432/tcp\") 0).HostPort}}", name]
        ).decode().strip()
        dsn = f"postgresql://postgres:pw@localhost:{port}/contracts"
        # 等就绪
        conn = None
        for _ in range(30):
            try:
                conn = psycopg.connect(dsn)
                break
            except Exception:
                time.sleep(1)
        assert conn is not None, "PG 未就绪"
        # 应用 migration + seed
        with conn.cursor() as cur:
            cur.execute(_DDL.read_text(encoding="utf-8"))
            cur.execute(_SEED.read_text(encoding="utf-8"))
        conn.commit()
        yield conn
        conn.close()
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


@pytest.fixture
def draft():
    ext = ContractExtraction(
        summary=SummaryFields(customer_name="兴晟泽", contract_name="劳务采购协议",
                              contract_type="框架", sign_date="2025年8月15日"),
        amount=AmountFields(amount_type="上限", amount="20.73万元", tax_rate=None),
        commercial=CommercialFields(post_eval="是", authorizer="刘继陈"),
    )
    md = "# 合同\n## 服务内容\n提供智能巡检服务。\n## 人员需求\n需算法工程师。\n"
    mods = [ModuleConfig("service", "服务内容", ["服务内容"]),
            ModuleConfig("staff", "人员需求", ["人员需求"])]
    matcher = KeywordMatcher({"智能巡检": ["智能巡检"]})
    return extract_one_contract("x.pdf", FakeMineruClient(md), FakeExtractClient(ext), mods, matcher)


def test_insert_draft_roundtrip(pg_conn, draft):
    new_id = insert_draft(pg_conn, contract_no="HT-DRAFT-0001", draft=draft, source_sha256="abc123")
    assert isinstance(new_id, int)

    with pg_conn.cursor() as cur:
        # 草稿行：confirmed=0，文本 AI 列写入，_ai_raw 留痕
        cur.execute("SELECT confirmed, contract_type, tag_ai, customer_name, "
                    "sign_date, sign_date_ai_raw, amount, amount_ai_raw, module_hits "
                    "FROM contracts_draft WHERE id=%s", (new_id,))
        row = cur.fetchone()
    confirmed, ctype, tag_ai, cust, sign_date, sign_raw, amount, amount_raw, mhits = row

    assert confirmed == 0
    assert ctype == "框架"                    # 文本 AI 列写入
    assert cust == "兴晟泽"
    assert tag_ai == 1                         # service 段命中「智能巡检」
    # DATE/DECIMAL 主列首版 NULL，原文在 _ai_raw
    assert sign_date is None and sign_raw == "2025年8月15日"
    assert amount is None and amount_raw == "20.73万元"
    # 模块命中存 JSONB，两模块
    hits = mhits if isinstance(mhits, list) else json.loads(mhits)
    by_key = {h["module_key"]: h for h in hits}
    assert set(by_key) == {"service", "staff"}
    assert by_key["service"]["hit"] == 1 and "智能巡检" in by_key["service"]["keywords"]
    assert by_key["staff"]["hit"] == 0


def test_draft_confirmed_check_rejects_formal(pg_conn, draft):
    # 草稿表 CHECK(confirmed=0)：不能把 confirmed=1 塞进草稿
    with pytest.raises(Exception):
        with pg_conn.cursor() as cur:
            cur.execute("INSERT INTO contracts_draft (contract_no, confirmed) VALUES ('X', 1)")
        pg_conn.commit()
    pg_conn.rollback()
