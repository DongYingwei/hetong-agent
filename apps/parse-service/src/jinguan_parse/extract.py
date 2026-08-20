"""T03 编排 —— 一份合同 PDF → 草稿记录。

流程（§4.1 / §6 / §7.1）：
  PDF → MinerU(md) → DeepSeek 抽 17 标量 AI 字段
      → 模块切分(配置驱动锚点) 抽四模块原文
      → 段内关键词精确匹配 → mod_*_hit/kw/cat + tag_ai 汇总
  → 组装 DraftContract（confirmed=0），供落库 contracts_draft + contract_module_hits。

设计：编排是深模块，小接口 extract_one_contract(pdf, clients, modules, matcher)。
依赖全注入（MineruClient / ExtractClient / 模块配置 / KeywordMatcher）→ 测试用 fake，不打真服务。
本函数【只返回结构】，不写库（返回结果，无副作用，便于测试）；落库是薄 adapter（T03 部署时接）。
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
import re

from .clients import ExtractClient, MineruClient
from .keywords import KeywordMatcher
from .schema import ContractExtraction


@dataclass
class ModuleConfig:
    """对应 contract_modules 一行（配置驱动，ADR-0004）。"""

    module_key: str
    name: str
    anchor_names: list[str]      # 对应合同内模块名称（章节锚点变体，§6.4）
    enabled: bool = True


@dataclass
class ModuleHit:
    """对应 contract_module_hits 一行。"""

    module_key: str
    hit: int                     # 0/1
    keywords: str | None         # 逗号分隔
    category: str | None         # 命中大方向（逗号分隔）
    raw_text: str | None         # 该模块原文（→向量库）
    raw_text_ai_raw: str | None  # 留痕


@dataclass
class DraftContract:
    """一条草稿记录（confirmed=0）：AI 标量字段 + 模块命中明细 + tag_ai + 全文 markdown。"""

    ai_fields: dict[str, str | None]         # 17 标量 AI 字段（键=DDL 列名）
    ai_raw: dict[str, str | None]            # <field>_ai_raw 留痕
    module_hits: list[ModuleHit]
    tag_ai: int
    mineru_md: str = ""                       # MinerU 全文 markdown（核对后据此切片建向量）
    confirmed: int = 0


def _slice_module_text(markdown: str, anchors: list[str]) -> str | None:
    """结构感知定位：从 md 里按锚点变体切出该模块段落原文。

    首版策略：找到第一个命中锚点的标题行，取到下一个 Markdown 标题（# 开头）之前。
    未命中任何锚点 → None（该模块在此合同缺失）。真实鲁棒性随评测迭代（G4）。
    """
    lines = markdown.splitlines()
    start = None
    for i, ln in enumerate(lines):
        stripped = ln.lstrip("#").strip()
        if any(a in stripped for a in anchors):
            start = i
            break
    if start is None:
        return None
    body: list[str] = [lines[start]]
    for ln in lines[start + 1:]:
        if ln.lstrip().startswith("#"):
            break
        body.append(ln)
    text = "\n".join(body).strip()
    return text or None


def extract_one_contract(
    pdf_path: str,
    mineru: MineruClient,
    extractor: ExtractClient,
    modules: list[ModuleConfig],
    matcher: KeywordMatcher,
) -> DraftContract:
    """T03 接缝：一份合同 PDF → DraftContract（不写库）。"""
    # 1. MinerU → markdown
    markdown = mineru.parse_pdf(pdf_path)
    return extract_markdown(markdown, extractor, modules, matcher)


_PAGE_MARKER = re.compile(r"(?im)^\s*(?:page\s+|第\s*)(\d+)(?:\s*(?:of\s+\d+|/\s*\d+|页))?\s*$")


def ledger_extraction_context(markdown: str, page_limit: int = 50, fallback_chars: int = 120_000) -> str:
    """取台账字段抽取重点上下文；全文仍用于关键词与向量检索。"""
    if page_limit < 1:
        return markdown
    for marker in _PAGE_MARKER.finditer(markdown):
        if int(marker.group(1)) > page_limit:
            return markdown[:marker.start()].rstrip()
    return markdown if len(markdown) <= fallback_chars else markdown[:fallback_chars].rstrip()


def extract_markdown(
    markdown: str,
    extractor: ExtractClient,
    modules: list[ModuleConfig],
    matcher: KeywordMatcher,
    extraction_context: str | None = None,
) -> DraftContract:
    """已有 Markdown → 草稿结构；全文保留，字段抽取可限于前页重点上下文。"""

    # 2. DeepSeek 抽 17 标量 AI 字段
    extraction: ContractExtraction = extractor.extract(extraction_context or markdown)
    ai_fields = extraction.flat_ai_fields()
    ai_raw = {f"{k}_ai_raw": v for k, v in ai_fields.items()}

    # 3. 四模块（配置驱动）：切原文 + 段内关键词匹配
    module_hits: list[ModuleHit] = []
    tag_ai = 0
    for m in modules:
        if not m.enabled:
            continue
        raw = _slice_module_text(markdown, m.anchor_names)
        kh = matcher.match(raw or "")
        if kh.hit:
            tag_ai = 1
        module_hits.append(
            ModuleHit(
                module_key=m.module_key,
                hit=1 if kh.hit else 0,
                keywords=",".join(kh.keywords) or None,
                category=",".join(kh.categories) or None,
                raw_text=raw,
                raw_text_ai_raw=raw,  # 首版原文即候选；人工核对后可改
            )
        )

    return DraftContract(
        ai_fields=ai_fields,
        ai_raw=ai_raw,
        module_hits=module_hits,
        tag_ai=tag_ai,
        mineru_md=markdown,
    )
