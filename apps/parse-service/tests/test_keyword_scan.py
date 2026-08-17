from jinguan_parse.keyword_scan import ScanKeyword, ScanModule, scan_fulltext_markdown, scan_markdown, split_module_paragraphs


MODULES = [
    ScanModule("service", "服务内容", ("服务内容",)),
    ScanModule("tech", "技术要求", ("技术要求",)),
    ScanModule("staff", "人员要求", ("人员要求",)),
]
AI = ScanKeyword(1, "AI", ("大模型", "智能体"))


def test_keyword_only_belongs_to_its_nearest_configured_heading():
    md = """# 合同\n## 服务内容\n提供智能体应用服务。\n## 人员要求\n配备大模型应用工程师。\n"""
    hits = scan_markdown(md, MODULES, [AI])
    assert [(x.module_key, x.matched_term) for x in hits] == [("service", "智能体"), ("staff", "大模型")]


def test_unclassified_body_is_retained_but_not_assigned_to_a_module():
    md = """# 合同\n大模型一词出现在前言。\n## 服务内容\n普通运维。\n"""
    paragraphs = split_module_paragraphs(md, MODULES)
    assert paragraphs[0][0] is None
    hit = scan_markdown(md, MODULES, [AI])[0]
    assert hit.module_key is None


def test_exact_term_does_not_use_semantic_or_synonym_matching():
    md = "## 技术要求\n需要模型能力。\n"
    assert scan_markdown(md, MODULES, [AI]) == []


def test_english_terms_are_case_insensitive_but_not_split_from_a_longer_word():
    md = "## 技术要求\n采用 ai 应用、AGENT 服务和 AIOps 平台，不包含 ailly。\n"
    hits = scan_markdown(md, MODULES, [ScanKeyword(1, "AI", ("Agent", "AIOps"))])
    assert [x.matched_term for x in hits] == ["AI", "Agent", "AIOps"]


def test_fulltext_index_keeps_heading_and_unclassified_matches_hidden_from_modules():
    md = "# AI 合同\n前言包含大模型。\n## 服务内容\n提供智能体服务。\n"
    hits = scan_fulltext_markdown(md, [AI])
    assert [(x.module_key, x.matched_term) for x in hits] == [(None, "AI"), (None, "大模型"), (None, "智能体")]
