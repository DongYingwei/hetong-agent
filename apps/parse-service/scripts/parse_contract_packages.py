#!/usr/bin/env python3
"""从 data/md-pdf 缓存解析合同包为待审核草稿，不重复调用 MinerU。

每个一级子目录为一个合同包；根目录 Markdown 各自为一个合同包。文件名中含
“合同/协议书/框架协议”者优先作为主协议。所有来源文件均记录在 contract_sources。
只写 contracts_draft，绝不建 Milvus 向量；人工确认后才进入正式合同和 RAG。
"""
from __future__ import annotations
import hashlib, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))
import psycopg  # noqa: E402
from jinguan_parse.clients import DeepSeekExtractClient  # noqa: E402
from jinguan_parse.config import load_settings  # noqa: E402
from jinguan_parse.extract import ModuleConfig, extract_markdown  # noqa: E402
from jinguan_parse.persist import insert_draft  # noqa: E402
from jinguan_parse.taxonomy import load_matcher  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
MD_ROOT = ROOT / "data" / "md-pdf"
QWEN_BASE = "http://192.168.121.32:6013/v1"
QWEN_MODEL = "Qwen3.8-27B"

def sha_text(text: str) -> str: return hashlib.sha256(text.encode()).hexdigest()
def package_key(path: pathlib.Path) -> str:
    return path.parts[0] if len(path.parts) > 1 else path.stem
def is_primary(path: pathlib.Path) -> bool:
    name = path.name
    return any(x in name for x in ("框架协议", "协议书", "合同")) and not any(x in name for x in ("技术协议", "附件", "报价", "说明书"))

def modules(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT module_key,name,anchor_names,enabled FROM contract_modules WHERE enabled ORDER BY sort_order")
        return [ModuleConfig(k,n,list(a or []),e) for k,n,a,e in cur.fetchall()]

def main() -> int:
    manifest = json.loads((MD_ROOT / "manifest.json").read_text(encoding="utf-8"))
    groups: dict[str, list[dict]] = {}
    for item in manifest["entries"]:
        path = pathlib.PurePosixPath(item["sources"][0]["relative_path"])
        groups.setdefault(package_key(path), []).append({"item": item, "path": path})
    s = load_settings(".env").model_copy(update={"llm_base_url": QWEN_BASE, "llm_model": QWEN_MODEL})
    xlsx = ROOT / s.ledger_xlsx
    with psycopg.connect(s.pg_url) as conn:
        ms, matcher, extractor = modules(conn), load_matcher(str(xlsx), s.keyword_sheet), DeepSeekExtractClient(s)
        for key, files in sorted(groups.items()):
            primary = next((f for f in files if is_primary(f["path"])), files[0])
            markdown = (MD_ROOT / primary["item"]["markdown_file"]).read_text(encoding="utf-8")
            draft = extract_markdown(markdown, extractor, ms, matcher)
            contract_no = draft.ai_fields.get("contract_no") or key
            with conn.cursor() as cur:
                cur.execute("INSERT INTO contract_packages(package_key,primary_source_path) VALUES(%s,%s) ON CONFLICT(package_key) DO NOTHING RETURNING id", (key,str(primary["path"])))
                row = cur.fetchone()
                if not row:
                    print(f"⏭ 已存在合同包：{key}"); continue
                pid = row[0]
            did = insert_draft(conn, contract_no, draft, source_sha256=primary["item"]["pdf_sha256"])
            with conn.cursor() as cur:
                cur.execute("UPDATE contract_packages SET draft_id=%s WHERE id=%s", (did,pid))
                for f in files:
                    it, p = f["item"], f["path"]
                    cur.execute("INSERT INTO contract_sources(package_id,source_sha256,source_relative_path,source_type,markdown_path,markdown_sha256,role) VALUES(%s,%s,%s,'pdf',%s,%s,%s)", (pid,it["pdf_sha256"],str(p),it["markdown_file"],it["markdown_sha256"],'primary' if f is primary else 'attachment'))
            conn.commit()
            print(f"✓ {key}: draft_id={did}，主协议={primary['path']}")
    return 0
if __name__ == '__main__': raise SystemExit(main())
