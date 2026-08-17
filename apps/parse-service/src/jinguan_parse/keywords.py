"""段内 AI 关键词精确匹配 —— §6.2 确定性子串匹配（pyahocorasick，评测确认复用开源）。

词表结构：大方向 → 具体词（§6.2）。匹配到具体词后反查其大方向。
用 Aho-Corasick 多模式一次扫描，60 词×数百合同性能无压力。
"""

from __future__ import annotations

from dataclasses import dataclass

try:
    import ahocorasick
except ModuleNotFoundError:  # 部署环境缺少可选 C 扩展时保持精确匹配可用。
    ahocorasick = None


@dataclass
class KeywordHit:
    hit: bool
    keywords: list[str]   # 命中的具体词（去重、保序）
    categories: list[str]  # 命中词所属大方向（去重、保序）


class KeywordMatcher:
    """从 {大方向: [具体词,...]} 词表构建，对文本做精确子串匹配。

    构造一次、多段复用。match() 返回该段的命中词与大方向。
    """

    def __init__(self, taxonomy: dict[str, list[str]]) -> None:
        self._automaton = ahocorasick.Automaton() if ahocorasick is not None else None
        self._word_to_cat: dict[str, str] = {}
        for category, words in taxonomy.items():
            for w in words:
                if not w:
                    continue
                self._word_to_cat[w] = category
                if self._automaton is not None:
                    self._automaton.add_word(w, w)
        # 空词表：automaton 无任何词，make_automaton 会抛错。此时 match 恒返回未命中。
        self._empty = len(self._word_to_cat) == 0
        if not self._empty:
            if self._automaton is not None:
                self._automaton.make_automaton()

    def match(self, text: str) -> KeywordHit:
        if self._empty:
            return KeywordHit(hit=False, keywords=[], categories=[])
        found_words: list[str] = []
        found_cats: list[str] = []
        seen_w: set[str] = set()
        seen_c: set[str] = set()
        # Aho-Corasick 不可用时使用同样的精确子串语义兜底；词表规模小，
        # 仅牺牲批量扫描性能，不改变命中结果。
        matches = self._automaton.iter(text or "") if self._automaton is not None else (
            (0, word) for word in self._word_to_cat if word in (text or "")
        )
        for _end, word in matches:
            if word not in seen_w:
                seen_w.add(word)
                found_words.append(word)
            cat = self._word_to_cat[word]
            if cat not in seen_c:
                seen_c.add(cat)
                found_cats.append(cat)
        return KeywordHit(hit=bool(found_words), keywords=found_words, categories=found_cats)
