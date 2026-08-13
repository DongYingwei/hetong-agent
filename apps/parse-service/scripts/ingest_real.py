"""一次性真实入库脚本 —— 把 data/test-example 的合同 PDF 走完整链路入库。

链路：PDF → [parse] MinerU+DeepSeek → contracts_draft
        → [confirm] 自动核对 → contracts(confirmed=1) + contract_module_hits
        → [vectorize] 全文切片 → embedding → Milvus contract_chunks

⚠️ 自动 confirm（confirmed_by="auto-ingest"）跳过人工核对，仅供 T09 测试数据。
   不是生产背书数据（坑8）；真上线需重走人工核对。

用法（在 apps/parse-service/ 下）：
    python3 scripts/ingest_real.py <pdf_path> [<pdf_path> ...]
    python3 scripts/ingest_real.py --all          # 跑 data/test-example 下全部顶层 PDF

依赖 apps/parse-service/.env（PG_URL 指向常驻查询库、LLM/MinerU/向量端点齐全）。
"""

from __future__ import annotations

import sys
import pathlib

# 让 `python3 scripts/ingest_real.py` 能 import src/jinguan_parse
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))

import psycopg  # noqa: E402

from jinguan_parse.config import load_settings  # noqa: E402
from jinguan_parse.clients import HttpMineruClient, DeepSeekExtractClient  # noqa: E402
from jinguan_parse.extract import ModuleConfig  # noqa: E402
from jinguan_parse.ingest import IngestDeps, ingest_one  # noqa: E402
from jinguan_parse.confirm import confirm_draft  # noqa: E402
from jinguan_parse.vector import (  # noqa: E402
    QwenEmbeddingClient,
    MilvusVectorStore,
    vectorize_confirmed_contract,
)
from jinguan_parse.taxonomy import load_matcher  # noqa: E402

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
TEST_DIR = REPO_ROOT / "data" / "test-example"


def _load_modules(pg_url: str) -> list[ModuleConfig]:
    with psycopg.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT module_key, name, anchor_names, enabled "
            "FROM contract_modules WHERE enabled ORDER BY sort_order"
        )
        return [ModuleConfig(k, n, list(a or []), e) for k, n, a, e in cur.fetchall()]


def _module_anchors(modules: list[ModuleConfig]) -> dict[str, list[str]]:
    return {m.module_key: m.anchor_names for m in modules}


def _read_mineru_md(pg_url: str, contract_id: int) -> str:
    with psycopg.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT mineru_md FROM contracts WHERE id = %s", (contract_id,))
        row = cur.fetchone()
        return row[0] if row and row[0] else ""


def ingest_one_full(path: str, s, deps: IngestDeps, embedder, store, anchors) -> None:
    name = pathlib.Path(path).name
    print(f"\n{'='*70}\n▶ 处理：{name}")

    # ① parse → 草稿
    print("  [1/3] MinerU 解析 + DeepSeek 抽取 → 草稿 …（大 PDF 可能数分钟）")
    conn = psycopg.connect(s.pg_url)
    try:
        r = ingest_one(conn, path, deps)
    finally:
        conn.close()
    if r.status == "failed":
        print(f"  ✗ 解析失败：{r.error}")
        return
    if r.status == "skipped_duplicate":
        print("  ⏭ 指纹命中，已入过库，跳过")
        return
    print(f"  ✓ 草稿入库 draft_id={r.draft_id}")

    # ② confirm → 正式库
    print("  [2/3] 自动核对 → 正式库 contracts …")
    conn = psycopg.connect(s.pg_url)
    try:
        contract_id = confirm_draft(conn, r.draft_id, confirmed_by="auto-ingest")
    finally:
        conn.close()
    print(f"  ✓ 入正式库 contract_id={contract_id}")

    # ③ vectorize → Milvus
    print("  [3/3] 全文切片 → embedding → Milvus …")
    markdown = _read_mineru_md(s.pg_url, contract_id)
    if not markdown:
        print("  ⚠ 正式库无 mineru_md，跳过建向量")
        return
    contract_no = pathlib.Path(path).stem
    n = vectorize_confirmed_contract(markdown, contract_id, contract_no, embedder, store, anchors)
    store.flush()  # 落盘，查询侧立即可见
    print(f"  ✓ 写入 Milvus {n} 个片段（已 flush）")


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1

    if argv == ["--all"]:
        paths = sorted(str(p) for p in TEST_DIR.glob("*.pdf"))
        if not paths:
            print(f"✗ {TEST_DIR} 下无顶层 PDF")
            return 1
    else:
        paths = argv

    s = load_settings(".env")
    print(f"PG   : {s.pg_url.split('@')[-1]}")
    print(f"MinerU: {s.mineru_base_url}  backend={s.mineru_backend}")
    print(f"LLM  : {s.llm_base_url}  model={s.llm_model}")
    print(f"向量 : embed={s.embed_base_url} milvus={s.milvus_uri}")

    modules = _load_modules(s.pg_url)
    anchors = _module_anchors(modules)
    # ledger_xlsx 默认相对仓库根；从任意 cwd 跑都能定位。
    xlsx = pathlib.Path(s.ledger_xlsx)
    if not xlsx.is_absolute():
        xlsx = REPO_ROOT / s.ledger_xlsx
    deps = IngestDeps(
        mineru=HttpMineruClient(s),
        extractor=DeepSeekExtractClient(s),
        modules=modules,
        matcher=load_matcher(str(xlsx), s.keyword_sheet),
    )
    embedder = QwenEmbeddingClient(s)
    store = MilvusVectorStore(s)

    for p in paths:
        if not pathlib.Path(p).is_file():
            print(f"\n✗ 文件不存在：{p}")
            continue
        try:
            ingest_one_full(p, s, deps, embedder, store, anchors)
        except Exception as e:  # 单份异常不阻断整批
            print(f"  ✗ 链路异常：{type(e).__name__}: {e}")

    print(f"\n{'='*70}\n✅ 完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
