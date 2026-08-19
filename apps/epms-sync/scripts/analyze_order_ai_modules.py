#!/usr/bin/env python3
"""对全文命中 AI 关键词的订单附件做四模块判定，结果写入 order_module_hits。"""
from __future__ import annotations

import argparse, json, os, re, sys
from pathlib import Path
import psycopg, requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from epms_sync.config import load_config
from import_order_ledger import DEFAULT_AI, database_url, norm_order_no

MODULES = {"role": "项目名称", "service": "服务内容", "tech": "技术要求", "staff": "人员需求"}
_MODULE_KEYS = "role|service|tech|staff"
_JSON_KEYS = "role|service|tech|staff|hit|keywords|evidence"

def parse_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text.strip(), re.S | re.I)
    text = fenced.group(1) if fenced else text[text.find("{"):text.rfind("}") + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Qwen 偶发把模块对象写成 ``...}}, {"service"...``：提前关掉了根对象。
        # 仅修复四个已知模块键之间的这一种无歧义格式错误，其他错误仍拒绝，避免吞掉坏结果。
        # 两个观测到的变体：``}}, {"service"``（多关根对象）和
        # ``}, {"service"``（把下一个属性错误包成对象）。
        repaired = re.sub(rf"\}}\s*\}},\s*\{{\s*\"(?={_MODULE_KEYS}\")", '}, "', text)
        repaired = re.sub(rf"\}}\s*,\s*\{{\s*\"(?={_MODULE_KEYS}\")", '}, "', repaired)
        # Qwen 还会偶发漏掉同一对象相邻字段的逗号，例如
        # ``"hit": true "keywords": [...]``。只在固定 schema 的字段名前补逗号，
        # 不尝试修复 evidence 自由文本内的引号，以免误写错误归类结果。
        repaired = re.sub(
            rf'(?:(?<=[\]}}\"])|(?<=true)|(?<=false)|(?<=null)|(?<=\d))(?=\s*"(?:{_JSON_KEYS})"\s*:)',
            ',',
            repaired,
        )
        repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
        data = json.loads(repaired)
    return data if isinstance(data, dict) else {}

def prepare_markdown(markdown: str, keywords: list[str], max_chars: int = 80_000) -> str:
    """长附件只保留命中词附近的段落，保住章节上下文并避免模型长上下文超时。"""
    if len(markdown) <= max_chars:
        return markdown
    lines = markdown.splitlines()
    indices = [i for i, line in enumerate(lines) if any(term and term.lower() in line.lower() for term in keywords)]
    if not indices:
        return markdown[:max_chars]
    ranges: list[tuple[int, int]] = []
    for i in indices:
        start, end = max(0, i - 80), min(len(lines), i + 81)
        if ranges and start <= ranges[-1][1]:
            ranges[-1] = (ranges[-1][0], max(ranges[-1][1], end))
        else:
            ranges.append((start, end))
    parts: list[str] = []
    used = 0
    for start, end in ranges:
        part = "\n".join(lines[start:end])
        if used + len(part) > max_chars:
            part = part[:max_chars - used]
        if part:
            parts.append(part); used += len(part)
        if used >= max_chars:
            break
    return "\n\n…（省略无关键词段落）…\n\n".join(parts)

def call_model(
    base_url: str,
    model: str,
    project_name: str,
    markdown: str,
    keywords: list[str],
    api_key: str = "",
) -> tuple[dict, str]:
    markdown = prepare_markdown(markdown, keywords)
    prompt = f'''你是订单附件 AI 业绩判定器。该订单全文精确命中的关键词：{", ".join(keywords) or "AI"}。
把命中的内容按最接近的四个模块归类：项目名称(role)、服务内容(service)、技术要求(tech)、人员需求(staff)。
仅当上述关键词在该模块标题或正文实际出现时 hit=true；不要同义词扩展，也不要因岗位名称含“大模型工程师”把整单判为 AI。没有明确标题时按段落意图归属，无可靠归属则均 false。项目名称可参考订单项目名称。
仅返回 JSON：{{"role":{{"hit":false,"keywords":[],"evidence":""}},"service":{{"hit":false,"keywords":[],"evidence":""}},"tech":{{"hit":false,"keywords":[],"evidence":""}},"staff":{{"hit":false,"keywords":[],"evidence":""}}}}。evidence 最多 500 字。
订单项目名称：{project_name or ""}
附件 Markdown：
{markdown}'''
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else None
            response = requests.post(
                base_url.rstrip("/") + "/chat/completions",
                headers=headers,
                json={"model": model, "temperature": 0, "messages": [{"role":"user", "content":prompt}]},
                timeout=300,
            )
            response.raise_for_status()
            raw = response.json()["choices"][0]["message"]["content"]
            return parse_json(raw), raw
        except (requests.RequestException, KeyError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < 2:
                continue
    raise RuntimeError(f"模型调用重试 3 次仍失败: {last_error}")

def main() -> None:
    cfg = load_config()
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", default=database_url())
    ap.add_argument("--ai-results", type=Path, default=DEFAULT_AI)
    ap.add_argument("--base-url", default=os.getenv("QWEN_BASE", "http://192.168.101.214:6015/v1"))
    ap.add_argument("--model", default=os.getenv("QWEN_MODEL", "Qwen3-30B-A3B"))
    ap.add_argument("--api-key", default=os.getenv("QWEN_API_KEY", ""), help="OpenAI-compatible API 的 Bearer Token；默认不携带")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--order-no", action="append", default=[], help="仅重试指定订单号；可重复传入")
    args = ap.parse_args()
    ai = json.loads(args.ai_results.read_text(encoding="utf-8"))
    ai_by_norm = {norm_order_no(k): v for k, v in ai.items()}
    with psycopg.connect(args.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id,order_no,project_name,ai_keywords FROM sys_order WHERE tag_ai=1 ORDER BY id")
            orders = cur.fetchall()
        if args.order_no:
            wanted = set(args.order_no)
            orders = [row for row in orders if row[1] in wanted]
            missing = wanted - {row[1] for row in orders}
            if missing:
                raise SystemExit(f"订单不存在或未命中 AI：{', '.join(sorted(missing))}")
        done = failed = skipped = 0
        for order_id, order_no, project_name, stored_terms in orders:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM order_module_hits WHERE order_id=%s", (order_id,))
                if cur.fetchone()[0] == 4 and not args.force:
                    skipped += 1; continue
            result = ai_by_norm.get(norm_order_no(order_no), {})
            paths = [cfg.md_dir / norm_order_no(order_no) / x for x in result.get("md_files", [])]
            text = "\n\n".join(p.read_text(encoding="utf-8", errors="replace") for p in paths if p.is_file())
            if not text:
                print(f"[skip] {order_no}: 没有可分析的附件 Markdown", flush=True); skipped += 1; continue
            keywords = stored_terms if isinstance(stored_terms, list) else result.get("hits", [])
            try:
                answer, raw = call_model(
                    args.base_url,
                    args.model,
                    project_name or "",
                    text,
                    keywords,
                    args.api_key,
                )
                values = []
                for key in MODULES:
                    item = answer.get(key) if isinstance(answer.get(key), dict) else {}
                    kws = [x for x in (item.get("keywords") or []) if x in keywords]
                    # 模型只负责段落归属，不能凭语义扩大关键词：没有回传原扫描词就不展示 AI。
                    values.append((order_id, key, 1 if item.get("hit") is True and kws else 0, ",".join(kws) or None, str(item.get("evidence") or "")[:500] or None, raw))
                with conn.cursor() as cur:
                    cur.executemany("""INSERT INTO order_module_hits(order_id,module_key,hit,keywords,raw_text,model_raw)
                      VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(order_id,module_key) DO UPDATE SET
                      hit=EXCLUDED.hit,keywords=EXCLUDED.keywords,raw_text=EXCLUDED.raw_text,model_raw=EXCLUDED.model_raw,updated_at=now()""", values)
                conn.commit(); done += 1; print(f"[ok {done}/{len(orders)}] {order_no}", flush=True)
            except Exception as exc:
                conn.rollback(); failed += 1; print(f"[failed] {order_no}: {exc}", file=sys.stderr, flush=True)
            if args.limit and done + failed >= args.limit: break
    print(f"完成：已分析 {done}，跳过 {skipped}，失败 {failed}")

if __name__ == "__main__": main()
