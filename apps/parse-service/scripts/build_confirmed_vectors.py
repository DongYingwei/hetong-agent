#!/usr/bin/env python3
"""把已确认的 Markdown 来源按台账合同号写入 PG 片段与 Milvus 向量。

只处理 ledger-source-match.csv 中 confirmed* 的来源；无原文的台账自然跳过。
要求：Docker 容器 hetong-contracts-db、embedding(8008)、Milvus(19530) 均可访问。
"""
from __future__ import annotations

import base64, csv, json, pathlib, re, subprocess
import httpx

ROOT = pathlib.Path(__file__).resolve().parents[3]
MD = ROOT / "data" / "md-file"
REPORT = MD / "ledger-source-match.csv"
EMBED = "http://192.168.121.33:8008/v1/embeddings"
MILVUS = "http://127.0.0.1:19530/v1/vector"


def sql(text: str) -> str:
    return "convert_from(decode('" + base64.b64encode(text.encode()).decode() + "','base64'),'UTF8')"


def pg(statement: str) -> str:
    return subprocess.run(
        ["docker", "exec", "-i", "hetong-contracts-db", "psql", "-At", "-U", "postgres", "-d", "contracts", "-v", "ON_ERROR_STOP=1"],
        input=statement, text=True, check=True, capture_output=True,
    ).stdout


def split(markdown: str) -> list[str]:
    chunks: list[str] = []
    for section in re.split(r"(?m)^#+\s*", markdown):
        section = section.strip()
        for start in range(0, len(section), 1100):
            part = section[start:start + 1300].strip()  # 200 字重叠
            if len(part) >= 40:
                chunks.append(part)
    return chunks


def main() -> None:
    manifest = json.loads((MD / "manifest.json").read_text(encoding="utf-8"))
    source_meta = {s["relative_path"]: e for e in manifest["entries"] for s in e["sources"]}
    groups: dict[str, list[dict[str, str]]] = {}
    for row in csv.DictReader(REPORT.open(encoding="utf-8-sig")):
        if row["status"].startswith("confirmed"):
            groups.setdefault(row["ledger_contract_no"], []).append(row)
    ids = {}
    for line in pg("SELECT id,contract_no FROM contracts;").splitlines():
        if "|" in line:
            cid, no = line.split("|", 1)
            ids[no] = int(cid)
    http = httpx.Client(timeout=300)
    for no, sources in groups.items():
        cid = ids[no]
        all_text = []
        source_rows = []
        for row in sources:
            entry = source_meta[row["source"]]
            text = (MD / row["markdown"]).read_text(encoding="utf-8")
            all_text.append(f"# 来源文件：{row['source']}\n\n{text}")
            source_rows.append((row, entry))
        chunks = split("\n\n".join(all_text))
        # PG 先落来源、全文与片段；同一合同重跑时精确重建。
        pg(f"DELETE FROM contract_chunks WHERE contract_id={cid}; DELETE FROM contract_sources WHERE package_id IN (SELECT id FROM contract_packages WHERE contract_id={cid}); DELETE FROM contract_packages WHERE contract_id={cid};")
        package_output = pg(f"INSERT INTO contract_packages(package_key,contract_id,status,confirmed_at) VALUES ({sql(no)},{cid},'confirmed',now()) RETURNING id;")
        pid = int(package_output.splitlines()[0])  # psql -At 仍会追加 "INSERT 0 1" 状态行
        commands = [f"UPDATE contracts SET mineru_md={sql(chr(10).join(all_text))}, mineru_md5=md5({sql(chr(10).join(all_text))}) WHERE id={cid};"]
        for index, (row, entry) in enumerate(source_rows):
            commands.append("INSERT INTO contract_sources(package_id,source_sha256,source_relative_path,source_type,markdown_path,markdown_sha256,role) VALUES ("
                f"{pid},{sql(entry['pdf_sha256'])},{sql(row['source'])},'pdf',{sql(row['markdown'])},{sql(entry['markdown_sha256'])}," + ("'primary'" if index == 0 else "'attachment'") + ");")
        for index, chunk in enumerate(chunks):
            commands.append(f"INSERT INTO contract_chunks(contract_id,contract_no,field,chunk_index,content,milvus_synced) VALUES ({cid},{sql(no)},'markdown',{index},{sql(chunk)},true);")
        pg("\n".join(commands))
        http.post(MILVUS + "/delete", json={"collectionName": "contract_chunks", "filter": f"contract_id == {cid}"}).raise_for_status()
        for start in range(0, len(chunks), 32):
            texts = chunks[start:start + 32]
            response = http.post(EMBED, json={"model": "Qwen3-Embedding-4B", "input": texts})
            response.raise_for_status()
            vectors = [x["embedding"] for x in sorted(response.json()["data"], key=lambda x: x["index"])]
            data = [{"vector": vector, "contract_id": cid, "contract_no": no, "field": "markdown", "module_category": "", "content": text} for vector, text in zip(vectors, texts)]
            response = http.post(MILVUS + "/insert", json={"collectionName": "contract_chunks", "data": data})
            response.raise_for_status()
        print(f"✓ {no}: sources={len(sources)}, chunks={len(chunks)}", flush=True)
    print(f"完成：{len(groups)} 条合同", flush=True)


if __name__ == "__main__":
    main()
