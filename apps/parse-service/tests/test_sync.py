"""T04 切片3 测试 —— 片段同步 sync_source_update / sync_label_update（§7.6.5 / G5）。

两层：
  · 单元：fake embedder/store + 真临时 PG（Docker）——验决策逻辑与向量副作用时机：
      - 原文 md5 相同 → unchanged，不动向量（0 次 delete/upsert）
      - 原文 md5 不同 → reindexed，先 delete_by_contract 再重建
      - 只改标签 → metadata_updated，只走 update_metadata（0 次 embed/delete）
  · 存在性校验：不存在的正式合同 → ContractNotFound。
无 Docker 自动跳过。
"""

from __future__ import annotations

import hashlib
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
_DDL2 = _ROOT / "packages" / "contracts-db" / "migrations" / "002_contract_md_sync.sql"
_SEED = _ROOT / "packages" / "contracts-db" / "seeds" / "001_dict.sql"

from jinguan_parse import (  # noqa: E402
    sync_source_update, sync_label_update, ContractNotFound, md_md5,
)
from fakes import FakeEmbeddingClient, FakeVectorStore  # noqa: E402

psycopg = pytest.importorskip("psycopg")


def _have_docker() -> bool:
    try:
        return subprocess.run(["docker", "info"], capture_output=True).returncode == 0
    except FileNotFoundError:
        return False


pytestmark = pytest.mark.skipif(not _have_docker(), reason="需要 Docker 跑临时 PG")


@pytest.fixture(scope="module")
def pg_conn():
    name = f"parse-sync-{uuid.uuid4().hex[:8]}"
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


_MD = "# 合同\n## 服务内容\n提供智能巡检平台建设与运维服务。\n## 结算条款\n按季度结算。\n"


def _insert_formal(pg_conn, contract_no: str, markdown: str) -> int:
    """直接塞一条 confirmed=1 正式行（带 mineru_md/md5），返回 id。"""
    with pg_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO contracts (contract_no, confirmed, mineru_md, mineru_md5) "
            "VALUES (%s, 1, %s, %s) RETURNING id",
            (contract_no, markdown, md_md5(markdown)),
        )
        cid = cur.fetchone()[0]
    pg_conn.commit()
    return cid


def _seed_chunks(store: FakeVectorStore, cid: int, contract_no: str):
    """预置该合同两条已建向量片段（模拟核对时建过）。"""
    store.rows.extend([
        {"vector": [0.0] * 4, "contract_id": cid, "contract_no": contract_no,
         "field": "service", "module_category": "智能巡检", "content": "巡检"},
        {"vector": [0.0] * 4, "contract_id": cid, "contract_no": contract_no,
         "field": "settlement_terms", "module_category": "", "content": "季度结算"},
    ])


# ── 原文重传：md5 相同 → unchanged ──
def test_source_same_md5_noop(pg_conn):
    cid = _insert_formal(pg_conn, "HT-SYNC-SAME", _MD)
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    _seed_chunks(store, cid, "HT-SYNC-SAME")

    r = sync_source_update(pg_conn, cid, _MD, emb, store)  # 同一份 md
    assert r.action == "unchanged" and r.chunks == 0
    assert store.deleted == [] and emb.batches == []       # 不动向量、不重算 embedding
    assert len(store.rows) == 2                            # 旧片段原样


# ── 原文重传：md5 不同 → 先删后重建 ──
def test_source_changed_md5_reindex(pg_conn):
    cid = _insert_formal(pg_conn, "HT-SYNC-CHG", _MD)
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    _seed_chunks(store, cid, "HT-SYNC-CHG")

    new_md = _MD + "## 新增条款\n增加验收标准。\n"
    r = sync_source_update(pg_conn, cid, new_md, emb, store)
    assert r.action == "reindexed" and r.chunks >= 3       # 前言/服务/结算/新增
    assert store.deleted == [cid]                          # 先按合同清旧
    assert emb.batches                                     # 重算了 embedding

    # 正式库 md/md5 已更新为新版
    with pg_conn.cursor() as cur:
        cur.execute("SELECT mineru_md5 FROM contracts WHERE id=%s", (cid,))
        assert cur.fetchone()[0] == hashlib.md5(new_md.encode("utf-8")).hexdigest()


# ── 只改标签 → 只更新 metadata，不重算/不删 ──
def test_label_update_metadata_only(pg_conn):
    cid = _insert_formal(pg_conn, "HT-SYNC-LBL", _MD)
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    _seed_chunks(store, cid, "HT-SYNC-LBL")

    r = sync_label_update(pg_conn, cid, {"contract_no": "HT-SYNC-LBL-NEW"}, store)
    assert r.action == "metadata_updated" and r.chunks == 2
    assert store.deleted == [] and emb.batches == []       # 不删、不重算
    assert store.meta_updates == [(cid, {"contract_no": "HT-SYNC-LBL-NEW"})]
    assert all(row["contract_no"] == "HT-SYNC-LBL-NEW" for row in store.rows)


def test_label_update_rejects_non_metadata(pg_conn):
    cid = _insert_formal(pg_conn, "HT-SYNC-BAD", _MD)
    store = FakeVectorStore()
    with pytest.raises(ValueError):
        sync_label_update(pg_conn, cid, {"content": "不可改"}, store)


# ── 存在性校验 ──
def test_source_missing_contract_raises(pg_conn):
    emb, store = FakeEmbeddingClient(), FakeVectorStore()
    with pytest.raises(ContractNotFound):
        sync_source_update(pg_conn, 999999, _MD, emb, store)
    pg_conn.rollback()


def test_label_missing_contract_raises(pg_conn):
    store = FakeVectorStore()
    with pytest.raises(ContractNotFound):
        sync_label_update(pg_conn, 999999, {"contract_no": "X"}, store)
    pg_conn.rollback()
