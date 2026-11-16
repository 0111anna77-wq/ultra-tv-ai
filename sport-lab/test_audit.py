from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_football_streams import identify, extract_entries, audit

SAMPLE = """#EXTM3U
#EXTINF:-1 ,МАТЧ! Футбол2 🇷🇺
https://example.org/m2/playlist.m3u8
#EXTINF:-1 ,Футбол 1 HD 🇷🇺
http://example.org/MatchFutbol1/stream
#EXTINF:-1 ,Матч! Футбол 3 HD 🇷🇺
https://example.org/m3/playlist.m3u8
#EXTINF:-1 ,Футбол 1 HD
https://example.org/ukrainian-football-1
#EXTINF:-1 ,Матч ТВ
https://example.org/match-tv
"""


class AuditTests(unittest.TestCase):
    def test_identification(self):
        self.assertEqual(identify("МАТЧ! Футбол2 🇷🇺", "https://x/1")[0], "match-football-2")
        self.assertEqual(identify("Match Football 3 HD", "https://x/2")[0], "match-football-3")
        self.assertEqual(identify("Футбол 1 HD", "http://x/MatchFutbol1/mpegts"), ("match-football-1", "inferred"))
        self.assertEqual(identify("Футбол 1 HD", "http://x/other"), (None, "unknown"))

    def test_extract(self):
        self.assertEqual(len(extract_entries(SAMPLE)), 5)

    def test_only_metadata(self):
        obj = audit(fetch=lambda url: SAMPLE)
        for channel in obj["channels"].values():
            self.assertEqual(channel["verifiedFreeAndAuthorized"], 0)
            self.assertEqual(channel["verifiedPlayable"], 0)
            for entry in channel["candidates"]:
                self.assertNotIn("url", entry)
                self.assertNotIn("http", repr(entry))
        self.assertEqual(obj["channels"]["match-football-1"]["candidateCount"], 1)
        self.assertEqual(obj["channels"]["match-football-2"]["candidateCount"], 1)
        self.assertEqual(obj["channels"]["match-football-3"]["candidateCount"], 1)

    def test_total_failure(self):
        with self.assertRaises(RuntimeError):
            audit(fetch=lambda url: (_ for _ in ()).throw(TimeoutError()))


if __name__ == "__main__":
    unittest.main()
