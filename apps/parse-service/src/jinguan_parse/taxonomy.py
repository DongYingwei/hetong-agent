"""AI 业绩关键词词表加载 —— 从台账 xlsx「AI业绩关键词」sheet 读入（§6.2）。

sheet 结构：A 列=大方向、B 列=具体技术，首行表头。产出 KeywordMatcher 要的
{大方向: [具体词,...]} 词表。openpyxl 只在此 loader 用（接入台账的一次性动作），
不进解析核心运行时依赖。
"""

from __future__ import annotations

from .keywords import KeywordMatcher


def load_taxonomy(xlsx_path: str, sheet: str = "AI业绩关键词") -> dict[str, list[str]]:
    """读 xlsx 词表 → {大方向: [具体词,...]}（保序、去空、去重）。"""
    import openpyxl

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb[sheet]
    taxonomy: dict[str, list[str]] = {}
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i == 1:  # 表头「大方向 / 具体技术」
            continue
        category = (row[0] or "").strip() if row and row[0] else ""
        word = (str(row[1]).strip() if len(row) > 1 and row[1] is not None else "")
        if not category or not word:
            continue
        bucket = taxonomy.setdefault(category, [])
        if word not in bucket:
            bucket.append(word)
    wb.close()
    return taxonomy


def load_matcher(xlsx_path: str, sheet: str = "AI业绩关键词") -> KeywordMatcher:
    """从台账词表构建 KeywordMatcher。"""
    return KeywordMatcher(load_taxonomy(xlsx_path, sheet))
