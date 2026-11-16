"""Run: python3 sport-lab/test_update.py"""
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_sport import fixture_id, normalize_fixture_list, rebuild, SOURCES


NOW = datetime(2026, 11, 17, tzinfo=timezone.utc)
SAMPLE = {
    "matches": [
        {"date": "2026-11-20", "team1": "Alpha", "team2": "Beta", "time": "18:00"},
        {"date": "2026-09-01", "team1": "Old", "team2": "Game"},
        {"date": "2026-11-21", "team1": "Invalid"},
    ]
}


class SportTests(unittest.TestCase):
    def test_normalized_dates_and_unverified_time(self):
        games = normalize_fixture_list(SAMPLE, "en.1.json", "АПЛ", NOW)
        self.assertEqual(len(games), 1)
        self.assertNotIn("time", games[0])
        self.assertEqual(games[0]["competition"], "АПЛ")
        self.assertEqual(games[0]["id"], fixture_id("en.1.json", "2026-11-20", "Alpha", "Beta"))

    def test_rebuild_and_idempotency(self):
        with TemporaryDirectory() as d:
            path = Path(d) / "data.json"
            def getter(url):
                return SAMPLE
            changed, data = rebuild(NOW, getter, path)
            self.assertTrue(changed)
            self.assertEqual(len(data["fixtures"]), len(SOURCES))
            self.assertTrue(path.exists())
            changed2, data2 = rebuild(NOW, getter, path)
            self.assertFalse(changed2)
            self.assertEqual(data2, data)

    def test_partial_failure_preserves_cached_source(self):
        with TemporaryDirectory() as d:
            path = Path(d) / "data.json"
            rebuild(NOW, lambda url: SAMPLE, path)
            def getter(url):
                if url.endswith("en.1.json"):
                    raise TimeoutError("test")
                return SAMPLE
            changed, data = rebuild(NOW, getter, path)
            self.assertTrue(changed)
            self.assertTrue(any(x.startswith("АПЛ:") for x in data["issues"]))
            self.assertEqual(len(data["fixtures"]), len(SOURCES))

    def test_total_failure_does_not_erase(self):
        with TemporaryDirectory() as d:
            path = Path(d) / "data.json"
            rebuild(NOW, lambda url: SAMPLE, path)
            before = path.read_text("utf-8")
            with self.assertRaises(RuntimeError):
                rebuild(NOW, lambda url: (_ for _ in ()).throw(ConnectionError()), path)
            self.assertEqual(path.read_text("utf-8"), before)


if __name__ == "__main__":
    unittest.main()
