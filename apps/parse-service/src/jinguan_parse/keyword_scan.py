"""配置驱动的关键词扫描；不使用向量检索，也不改变 contract_chunks。"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable


@dataclass(frozen=True)
class ScanModule:
    key: str
    name: str
    anchors: tuple[str, ...]


@dataclass(frozen=True)
class ScanKeyword:
    id: int
    name: str
    terms: tuple[str, ...]


@dataclass(frozen=True)
class ScanHit:
    module_key: str | None
    keyword_id: int
    matched_term: str
    paragraph_no: int
    paragraph_text: str


_heading = re.compile(r"^\s{0,3}#{1,6}\s*(.*?)\s*$")
_ascii_word_char = re.compile(r"[A-Za-z0-9]")


def _normalise(value: str) -> str:
    return re.sub(r"[\s：:、，,。.\-—_（）()【】\[\]]", "", value).lower()


def _module_for_heading(line: str, modules: Iterable[ScanModule]) -> ScanModule | None:
    match = _heading.match(line)
    if not match:
        return None
    title = _normalise(match.group(1))
    for module in modules:
        if any(_normalise(anchor) and _normalise(anchor) in title for anchor in module.anchors):
            return module
    return None


def split_module_paragraphs(markdown: str, modules: Iterable[ScanModule]) -> list[tuple[str | None, int, str]]:
    """按最近一个配置标题给正文段落归属；无归属正文以 None 留存审计。"""
    current: str | None = None
    out: list[tuple[str | None, int, str]] = []
    para_no = 0
    for raw in markdown.splitlines():
        found = _module_for_heading(raw, modules)
        if found is not None:
            current = found.key
            continue
        text = raw.strip()
        if not text or text.startswith("<!--"):
            continue
        # 其他标题是当前模块的子章节，仍归属最近模块；文档标题在未命中时不归属。
        if _heading.match(raw):
            continue
        para_no += 1
        out.append((current, para_no, text))
    return out


def _term_matches(text: str, term: str) -> bool:
    """词面匹配：中文按精确包含；含英文/数字的词忽略大小写且不可拆分。

    例如 ``AI`` 可以命中“AI应用”，但不能从 ``ailly`` 或 ``AIOps`` 中拆出；
    后者会由完整配置词 ``AIOps`` 自己命中。
    """
    if _ascii_word_char.search(term):
        return re.search(rf"(?<![A-Za-z0-9]){re.escape(term)}(?![A-Za-z0-9])", text, re.IGNORECASE) is not None
    return term in text


def scan_fulltext_markdown(markdown: str, keywords: Iterable[ScanKeyword]) -> list[ScanHit]:
    """对完整 Markdown 做隐藏索引，不按模块归类，也不漏掉标题中的词。"""
    hits: list[ScanHit] = []
    paragraph_no = 0
    for raw in markdown.splitlines():
        text = raw.strip()
        if not text or text.startswith("<!--"):
            continue
        paragraph_no += 1
        for keyword in keywords:
            for term in tuple(dict.fromkeys((keyword.name, *keyword.terms))):
                if term and _term_matches(text, term):
                    hits.append(ScanHit(None, keyword.id, term, paragraph_no, text))
    return hits


def scan_markdown(markdown: str, modules: Iterable[ScanModule], keywords: Iterable[ScanKeyword]) -> list[ScanHit]:
    """子词精确包含匹配。父词本身也可作为匹配词，便于配置只有父词的场景。"""
    hits: list[ScanHit] = []
    for module_key, para_no, text in split_module_paragraphs(markdown, modules):
        for keyword in keywords:
            terms = tuple(dict.fromkeys((keyword.name, *keyword.terms)))
            for term in terms:
                if term and _term_matches(text, term):
                    hits.append(ScanHit(module_key, keyword.id, term, para_no, text))
    return hits
