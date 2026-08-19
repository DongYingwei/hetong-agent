from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from epms_sync.export import _review_query_param  # noqa: E402


class ReviewTimeQueryTest(unittest.TestCase):
    def test_dates_expand_to_whole_review_days(self):
        self.assertEqual(
            _review_query_param("2026-08-01", "2026-08-18"),
            {
                "uuid": "",
                "reviewState": "",
                "reviewTimeSt": "2026-08-01 00:00:00",
                "reviewTimeEd": "2026-08-18 23:59:59",
            },
        )

    def test_exact_review_time_is_preserved(self):
        query = _review_query_param("2026-08-01 15:12:19", "2026-08-18 15:12:29")
        self.assertEqual(query["reviewTimeSt"], "2026-08-01 15:12:19")
        self.assertEqual(query["reviewTimeEd"], "2026-08-18 15:12:29")
        self.assertNotIn("startTimeFrom", query)
        self.assertNotIn("endTimeTo", query)


if __name__ == "__main__":
    unittest.main()
