from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from analyze_order_ai_modules import parse_json, prepare_markdown


class AnalyzeOrderModulesTest(unittest.TestCase):
    def test_repairs_qwen_extra_object_closure_between_modules(self):
        # 失败订单 HSKJ/C-QC-2026009-3 的同类模型输出：role 后多一个 }。
        malformed = ('{"role":{"hit":true,"keywords":["智驾"],"evidence":"x"}},'
                     '{"service":{"hit":false,"keywords":[],"evidence":""},'
                     '"tech":{"hit":false,"keywords":[],"evidence":""},'
                     '"staff":{"hit":false,"keywords":[],"evidence":""}}')
        result = parse_json(malformed)
        self.assertTrue(result["role"]["hit"])
        self.assertIn("service", result)

    def test_repairs_qwen_wrapped_next_module_object(self):
        malformed = ('{"role":{"hit":true,"keywords":["智驾"],"evidence":"x"},'
                     '{"service":{"hit":false,"keywords":[],"evidence":""},'
                     '"tech":{"hit":false,"keywords":[],"evidence":""},'
                     '"staff":{"hit":false,"keywords":[],"evidence":""}}')
        result = parse_json(malformed)
        self.assertTrue(result["role"]["hit"])
        self.assertIn("service", result)

    def test_repairs_missing_comma_between_known_fields(self):
        # 失败订单 HSKJ/C-DL-2025609-RZ-11-N1、RZ-48-N1 的错误类型：
        # Qwen 在对象内相邻字段间漏掉逗号，json.loads 报 Expecting ',' delimiter。
        malformed = ('{"role":{"hit":true "keywords":["AI"],"evidence":"x"},'
                     '"service":{"hit":false,"keywords":[],"evidence":""},'
                     '"tech":{"hit":false,"keywords":[],"evidence":""},'
                     '"staff":{"hit":false,"keywords":[],"evidence":""}}')
        result = parse_json(malformed)
        self.assertTrue(result["role"]["hit"])
        self.assertEqual(result["role"]["keywords"], ["AI"])

    def test_long_document_keeps_keyword_context_not_entire_document(self):
        markdown = "\n".join(["无关段落"] * 10000 + ["# 技术要求", "采用人工智能模型"] + ["无关段落"] * 10000)
        excerpt = prepare_markdown(markdown, ["人工智能"])
        self.assertIn("采用人工智能模型", excerpt)
        self.assertLess(len(excerpt), len(markdown))

if __name__ == "__main__":
    unittest.main()
