"""片段同步 —— T04 切片3（§7.6.5）。

G5 决策（2026-08-12）：
  · 触发方式 = 显式函数调用 sync_contract() + /sync 端点（不引入事件/MQ 基建）。
  · 更新粒度分两类：
      - 原文重传：比对 MinerU 全文 md 的 MD5。相同 → 跳过（no-op）；
        不同 → 更新正式库 mineru_md/md5 + delete_by_contract + 用新全文重切重建向量。
      - 只改标签/关键字：不重算 embedding，仅更新 Milvus 命中片段的 metadata。

坑9 守则不变：只对正式库(confirmed=1)合同同步；草稿区不建/不同步向量。
设计：编排是深模块，PG 连接 + 向量客户端全注入 → 测试用 fake，不打真服务。
"""

from __future__ import annotations

from dataclasses import dataclass

from psycopg import Connection

from .confirm import md_md5
from .vector import EmbeddingClient, VectorStore, vectorize_confirmed_contract


class ContractNotFound(Exception):
    pass


# 只允许改的 Milvus metadata 字段（与 vector.MilvusVectorStore._META_FIELDS 一致）。
_META_FIELDS = ("contract_no", "field", "module_category")


@dataclass
class SyncResult:
    contract_id: int
    action: str          # "reindexed" | "unchanged" | "metadata_updated"
    chunks: int = 0      # reindexed=写入片段数；metadata_updated=改动片段数


def _load_contract(conn: Connection, contract_id: int) -> tuple[str, str | None, str | None]:
    """读正式库合同的 contract_no / 现存 md5 / 现存全文 md。不存在则抛。"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT contract_no, mineru_md5, mineru_md FROM contracts WHERE id = %s AND confirmed = 1",
            (contract_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise ContractNotFound(f"正式库合同 id={contract_id} 不存在")
    return row[0], row[1], row[2]


def sync_source_update(
    conn: Connection,
    contract_id: int,
    new_markdown: str,
    embedder: EmbeddingClient,
    store: VectorStore,
    module_anchors: dict[str, list[str]] | None = None,
) -> SyncResult:
    """原文重传：比 MD5 决定是否重建（G5）。

    相同 → unchanged（不动 PG、不动向量）；不同 → 更新正式库全文/md5，
    清旧片段后用新全文重切重建向量。
    """
    contract_no, old_md5, _ = _load_contract(conn, contract_id)
    new_md5 = md_md5(new_markdown)
    if new_md5 == old_md5:
        return SyncResult(contract_id, "unchanged")

    with conn.cursor() as cur:
        cur.execute(
            "UPDATE contracts SET mineru_md = %s, mineru_md5 = %s WHERE id = %s",
            (new_markdown, new_md5, contract_id),
        )
    conn.commit()

    store.delete_by_contract(contract_id)
    n = vectorize_confirmed_contract(
        new_markdown, contract_id, contract_no, embedder, store, module_anchors=module_anchors
    )
    return SyncResult(contract_id, "reindexed", chunks=n)


def sync_label_update(
    conn: Connection,
    contract_id: int,
    patch: dict,
    store: VectorStore,
) -> SyncResult:
    """只改标签/关键字：更新命中片段的 Milvus metadata，不重算 embedding（G5）。

    `patch`：要改的 metadata 字段（contract_no/field/module_category），例如合同号更正。
    正式库对应列由上游（confirm/运营 CRUD）负责改；此处只把向量库 metadata 对齐。
    """
    if not patch:
        return SyncResult(contract_id, "metadata_updated", chunks=0)
    bad = set(patch) - set(_META_FIELDS)
    if bad:
        raise ValueError(f"只可改 metadata 字段 {_META_FIELDS}，非法：{sorted(bad)}")
    _load_contract(conn, contract_id)  # 存在性校验（正式库、confirmed=1）
    n = store.update_metadata_by_contract(contract_id, patch)
    return SyncResult(contract_id, "metadata_updated", chunks=n)
