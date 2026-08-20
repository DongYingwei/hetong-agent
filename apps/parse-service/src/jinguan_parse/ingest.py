"""批处理 + 指纹去重 —— T04 切片4。

流程（§7.1 / §8）：一批 PDF → 逐份 [指纹去重 → extract_one_contract → insert_draft]
  · SHA-256 文件指纹：解析前拦截重复（同一文件已入草稿则跳过）
  · 失败：标记该份失败，不阻断整批（§8）
  · 断点续跑：已处理过（指纹命中草稿或正式库）的自动跳过

设计：批处理编排是深模块，小接口 ingest_batch(paths, deps)。抽取/落库客户端全注入
（复用 T03 的 extract_one_contract + insert_draft）→ 可对 fake 抽取 + 真/临时 PG 测试。
不碰向量/同步（T04 后续切片）。
"""

from __future__ import annotations

import hashlib
import pathlib
import re
from dataclasses import dataclass
from typing import Callable

from psycopg import Connection

from .clients import ExtractClient, MineruClient
from .extract import ModuleConfig, extract_one_contract, extract_markdown
from .keywords import KeywordMatcher
from .persist import insert_draft


_CONTRACT_NO_IN_FILENAME = re.compile(r"(?i)(?:HSKJ/C-)?[A-Z]{1,8}-\d{4,}(?:-[A-Z0-9]+)*")


def default_contract_no(path: str) -> str:
    """从文件名优先提取常见合同号；无法提取时生成不超过 Milvus 128 字符限制的稳定兜底值。"""
    stem = pathlib.Path(path).stem
    matched = _CONTRACT_NO_IN_FILENAME.search(stem)
    if matched:
        return matched.group(0)
    if len(stem) <= 128:
        return stem
    digest = hashlib.sha256(stem.encode("utf-8")).hexdigest()[:12]
    return f"{stem[:113]}-{digest}"


def file_sha256(path: str, _chunk: int = 1 << 20) -> str:
    """流式计算文件 SHA-256（大 PDF 不全读进内存）。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(_chunk), b""):
            h.update(block)
    return h.hexdigest()


def _already_ingested(conn: Connection, sha: str) -> bool:
    """指纹是否已在草稿区（未核对）或已核对入正式库。

    草稿区存 source_sha256；正式库不存指纹（核对搬运时不带），但草稿删除后
    正式库有对应 contract_no——首版以草稿指纹为准做去重；正式库去重靠 contract_no UNIQUE 兜底。
    """
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM contracts_draft WHERE source_sha256 = %s LIMIT 1", (sha,))
        return cur.fetchone() is not None


@dataclass
class IngestResult:
    path: str
    status: str          # "ingested" | "skipped_duplicate" | "failed"
    draft_id: int | None = None
    error: str | None = None


@dataclass
class IngestDeps:
    """注入依赖：抽取客户端 + 模块配置 + 关键词匹配器 + 提取合同号的函数。"""

    mineru: MineruClient
    extractor: ExtractClient
    modules: list[ModuleConfig]
    matcher: KeywordMatcher
    # 从抽取结果 + 文件名决定 contract_no（手工列，草稿需有键）。默认用文件名兜底。
    contract_no_of: Callable[[object, str], str] | None = None


def ingest_one(conn: Connection, path: str, deps: IngestDeps, force: bool = False,
               markdown: str | None = None, extraction_context: str | None = None) -> IngestResult:
    """处理一份 PDF：指纹去重 → 抽取 → 落草稿。失败返回 status=failed，不抛。

    force=True：跳过指纹去重（重新解析）。若同指纹草稿已存在，先删旧草稿再重建；
    已核对入正式库的合同不受影响（正式库去重靠 contract_no，重解析产出新草稿供再次核对）。
    """
    try:
        sha = file_sha256(path)
        if not force and _already_ingested(conn, sha):
            return IngestResult(path, "skipped_duplicate")
        if force:
            # 清掉同指纹的旧草稿，避免重复草稿堆积（正式库记录不动）。
            with conn.cursor() as cur:
                cur.execute("DELETE FROM contracts_draft WHERE source_sha256 = %s", (sha,))
            conn.commit()
        # HTTP 上传已先落统一 Markdown 缓存时，禁止重复调用 MinerU；批处理仍沿用原有路径。
        draft = (extract_markdown(markdown, deps.extractor, deps.modules, deps.matcher, extraction_context)
                 if markdown is not None
                 else extract_one_contract(path, deps.mineru, deps.extractor, deps.modules, deps.matcher))
        if deps.contract_no_of is not None:
            contract_no = deps.contract_no_of(draft, path)
        else:
            contract_no = default_contract_no(path)
        draft_id = insert_draft(conn, contract_no=contract_no, draft=draft, source_sha256=sha)
        return IngestResult(path, "ingested", draft_id=draft_id)
    except Exception as e:  # §8：单份失败不阻断整批
        return IngestResult(path, "failed", error=f"{type(e).__name__}: {e}")


def ingest_batch(conn: Connection, paths: list[str], deps: IngestDeps) -> list[IngestResult]:
    """一批 PDF 逐份处理，断点续跑（指纹命中自动跳过），单份失败不阻断。"""
    return [ingest_one(conn, p, deps) for p in paths]
