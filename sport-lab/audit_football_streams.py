#!/usr/bin/env python3
"""Audit PUBLIC playlist metadata for the three paid Match Futbol channels.

This does NOT fetch channel video, store playback URLs, circumvent DRM, or
certify that a playlist offers rights to distribute paid TV.
"""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import re
import sys
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parent / "source-audit.json"
PLAYLISTS = {
    "iptv-org": "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/ru.m3u",
    "freecatv": "https://raw.githubusercontent.com/manikiptv/freecatv.github.io/main/freecatv.m3u8",
}
CHANNELS = ("match-football-1", "match-football-2", "match-football-3")


def identify(name: str, uri: str) -> tuple[str | None, str]:
    """Exact naming, with weak fallback for generic Russian Futbol title."""
    text = re.sub(r"\s+", " ", name.casefold().replace("ё", "е"))
    m = re.search(r"(?:матч\s*!?|match\s*!?)\s*(?:футбол|futbol|football)\s*([123])\b", text)
    if m:
        return "match-football-" + m.group(1), "name"
    # Generic 'Футбол' may be another country's channel; require matching URL hint.
    m = re.search(r"\bфутбол\s*([123])\b", text)
    if m and re.search(r"(?:matchfutbol|matc-futbol|match[_-]?football)", uri, re.I):
        return "match-football-" + m.group(1), "inferred"
    return None, "unknown"


def extract_entries(content: str) -> list[tuple[str, str]]:
    """Read EXTINF titles and next HTTP(S) URLs only; never open URLs."""
    items = []
    current = None
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF:"):
            current = line.rsplit(",", 1)[-1].strip()
        elif line.startswith("#"):
            continue
        elif line and current is not None:
            if line.startswith(("https://", "http://")):
                items.append((current, line))
            current = None
    return items


def read_public_playlist(url: str) -> str:
    req = Request(url, headers={"User-Agent": "UltraTV-SportsLab-Audit/0.1"})
    with urlopen(req, timeout=15) as response:
        return response.read(1_000_000).decode("utf-8", "replace")


def audit(fetch=read_public_playlist) -> dict:
    results = {name: [] for name in CHANNELS}
    errors = []
    successful = 0
    for source, url in PLAYLISTS.items():
        try:
            data = fetch(url)
            if not isinstance(data, str) or "#EXTINF" not in data:
                raise ValueError("Not an M3U listing")
            successful += 1
            for name, stream_url in extract_entries(data):
                channel, basis = identify(name, stream_url)
                if channel is None:
                    continue
                results[channel].append({
                    "source": source,
                    "basis": basis,
                    # Privacy/safety: no raw stream addresses in published JSON.
                    "fingerprint": sha256(stream_url.encode()).hexdigest()[:12],
                    "state": "listed_unverified",
                    "technicalTested": False,
                    "rightsVerified": False,
                })
        except Exception as error:
            errors.append({"source": source, "error": type(error).__name__})
    if successful == 0:
        raise RuntimeError("All playlist indices unavailable; retain previous audit")
    for channel in CHANNELS:
        dedup = {(row["source"], row["fingerprint"]): row for row in results[channel]}
        results[channel] = sorted(dedup.values(), key=lambda r: (r["source"], r["fingerprint"]))
    return {
        "schema": 1,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "purpose": "Discover candidate channel names only; NO confirmed free/playable streams.",
        "channels": {channel: {
            "candidateCount": len(results[channel]), "verifiedPlayable": 0,
            "verifiedFreeAndAuthorized": 0, "candidates": results[channel]
        } for channel in CHANNELS},
        "sourceErrors": errors,
    }


def main() -> None:
    result = audit()
    previous = None
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text("utf-8"))
        except (ValueError, OSError):
            pass
    # Exclude timestamp from comparison to avoid frequent pointless commits.
    if previous is not None and {k: v for k, v in result.items() if k != "generatedAt"} == {
        k: v for k, v in previous.items() if k != "generatedAt"
    }:
        print("No candidate-list changes")
        return
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Candidates found:", {x: result["channels"][x]["candidateCount"] for x in CHANNELS})
    print("Confirmed authorized free streams: 0 (verification not implemented)")


if __name__ == "__main__":
    try:
        main()
    except Exception as ex:
        print("Audit failed:", type(ex).__name__, str(ex), file=sys.stderr)
        raise SystemExit(1)
