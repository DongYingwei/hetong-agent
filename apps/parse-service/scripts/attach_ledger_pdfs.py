#!/usr/bin/env python3
"""将后补 PDF 绑定到既有合同台账，写全文、模块关键词结果和 Milvus 向量。

此脚本只更新明确列出的三条已审核台账，不新建或覆盖其结构化台账字段。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps/parse-service/src"))

from jinguan_parse.config import load_settings
from jinguan_parse.vector import QwenEmbeddingClient, MilvusVectorStore, markdown_to_segments, vectorize_confirmed_contract
from jinguan_parse.chunking import build_chunks

MD_ROOT = ROOT / "data/md-file"
TARGETS = {
    "北京字跳2026年-2027年数据服务框架": ["北京字跳2026年-2027年数据服务框架.pdf"],
    "奇瑞股份智能舱人力": [
        "V250223-奇瑞股份智舱中心人力资源2025年外包框架华东区人员租赁项目/2025年奇瑞股份智舱中心（AI平台开发）人力资源外包框架采购服务合同-南京华苏科技有限公司.pdf",
        "V250223-奇瑞股份智舱中心人力资源2025年外包框架华东区人员租赁项目/2025年奇瑞股份智舱中心人力资源外包框架采购-AI平台开发-南京华苏正式技术协议.pdf",
    ],
    "宁波博登数据标注": ["C260012-宁波博登惠州数据标注人员租赁项目2026OLE.pdf"],
}


def main() -> None:
    settings = load_settings(ROOT / "apps/parse-service/.env")
    manifest = json.loads((MD_ROOT / "manifest.json").read_text(encoding="utf-8"))
    entries = {s["relative_path"]: e for e in manifest["entries"] for s in e["sources"]}
    embedder, store = QwenEmbeddingClient(settings), MilvusVectorStore(settings)
    anchors: dict[str, list[str]] = {}
    with psycopg.connect(settings.pg_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT module_key,anchor_names FROM contract_modules WHERE enabled ORDER BY sort_order")
            anchors = {key: list(names or []) for key, names in cur.fetchall()}
        for contract_no, paths in TARGETS.items():
            sources = []
            for relative_path in paths:
                entry = entries.get(relative_path)
                if not entry:
                    raise RuntimeError(f"manifest 缺少 {relative_path}")
                source = next(s for s in entry["sources"] if s["relative_path"] == relative_path)
                markdown_file = MD_ROOT / entry["markdown_file"]
                if not markdown_file.is_file():
                    raise RuntimeError(f"Markdown 缺失 {markdown_file}")
                sources.append((relative_path, source, entry, markdown_file.read_text(encoding="utf-8")))
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM contracts WHERE contract_no=%s AND confirmed=1", (contract_no,))
                row = cur.fetchone()
                if not row:
                    raise RuntimeError(f"未找到已确认台账 {contract_no}")
                contract_id = row[0]
                markdown = "\n\n".join(f"# 来源文件：{path}\n\n{text}" for path, _, _, text in sources)
                cur.execute("DELETE FROM contract_sources WHERE package_id IN (SELECT id FROM contract_packages WHERE contract_id=%s)", (contract_id,))
                cur.execute("DELETE FROM contract_packages WHERE contract_id=%s", (contract_id,))
                cur.execute("DELETE FROM contract_chunks WHERE contract_id=%s", (contract_id,))
                cur.execute("INSERT INTO contract_packages(package_key,contract_id,status,confirmed_at) VALUES(%s,%s,'confirmed',now()) RETURNING id", (contract_no, contract_id))
                package_id = cur.fetchone()[0]
                cur.execute("UPDATE contracts SET mineru_md=%s, mineru_md5=%s WHERE id=%s", (markdown, hashlib.md5(markdown.encode()).hexdigest(), contract_id))
                for i, (relative_path, source, entry, _) in enumerate(sources):
                    cur.execute("""INSERT INTO contract_sources(package_id,source_sha256,source_relative_path,source_type,markdown_path,markdown_sha256,role)
                        VALUES(%s,%s,%s,'pdf',%s,%s,%s)""", (package_id, entry["pdf_sha256"], relative_path, entry["markdown_file"], entry["markdown_sha256"], "primary" if i == 0 else "attachment"))
                chunks = build_chunks(markdown_to_segments(markdown, contract_id, contract_no, anchors), module_keys=set(anchors))
                for chunk in chunks:
                    cur.execute("""INSERT INTO contract_chunks(contract_id,contract_no,field,chunk_index,content,milvus_synced)
                        VALUES(%s,%s,%s,%s,%s,true)""", (contract_id, contract_no, chunk.field, chunk.chunk_index, chunk.content))
            conn.commit()
            store.delete_by_contract(contract_id)
            count = vectorize_confirmed_contract(markdown, contract_id, contract_no, embedder, store, anchors)
            store.flush()
            # 关键词模块结果由服务使用同一份 Markdown 重新扫描，避免人工编造命中。
            resp = httpx.post("http://127.0.0.1:8100/contracts/rescan-keywords", json={"contract_id": contract_id}, timeout=120)
            resp.raise_for_status()
            print(f"✓ {contract_no}: sources={len(sources)}, chunks={count}, keyword_rescan=ok", flush=True)


if __name__ == "__main__":
    main()
