#!/usr/bin/env python3
"""Generate sports fixtures JSON from CC0 OpenFootball. No video/stream scraping."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from urllib.request import Request, urlopen
import json
import re
import sys

HERE = Path(__file__).resolve().parent
OUT = HERE / "data.json"
BASE = "https://raw.githubusercontent.com/openfootball/football.json/master/"
SOURCES = {
    "en.1.json": "АПЛ",
    "es.1.json": "Ла Лига",
    "de.1.json": "Бундеслига",
    "it.1.json": "Серия А",
    "fr.1.json": "Лига 1",
}


def fixture_id(filename: str, date: str, home: str, away: str) -> str:
    """Stable JavaScript-compatible 32-bit hash for existing saved fixtures."""
    key = "|".join((filename, date, home, away))
    num = 0
    # JavaScript charCodeAt iterates UTF-16 code units, including surrogate pairs.
    raw = key.encode("utf-16-le")
    for i in range(0, len(raw), 2):
        unit = raw[i] | (raw[i + 1] << 8)
        num = (num * 31 + unit) & 0xFFFFFFFF
    return filename.replace(".json", "") + "-" + format(num, "x")


def normalize_fixture_list(payload: dict, filename: str, league: str,
                           today: datetime) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("matches"), list):
        raise ValueError("Invalid match list for " + filename)
    low = (today - timedelta(days=1)).date().isoformat()
    high = (today + timedelta(days=21)).date().isoformat()
    result = []
    for item in payload["matches"]:
        if not isinstance(item, dict):
            continue
        date = item.get("date")
        home = item.get("team1")
        away = item.get("team2")
        if not all(isinstance(x, str) for x in (date, home, away)):
            continue
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) or not (low <= date <= high):
            continue
        result.append({
            "id": fixture_id(filename, date, home, away),
            "competition": league, "date": date, "home": home, "away": away,
        })
    return result


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "UltraTV-SportsLab/0.1 (metadata-only)"})
    with urlopen(req, timeout=18) as response:
        if response.status != 200:
            raise RuntimeError("Bad HTTP status " + str(response.status))
        return json.loads(response.read(4_000_000).decode("utf-8"))


def fetch_html(url: str) -> str:
    req = Request(url, headers={"User-Agent": "UltraTV-SportsLab/0.1 (metadata-only)"})
    with urlopen(req, timeout=18) as response:
        if response.status != 200:
            raise RuntimeError("Bad HTTP status " + str(response.status))
        return response.read(900_000).decode("utf-8", errors="replace")


def parse_start_programs(page: str, url: str) -> list[dict]:
    """Extract public TV-program metadata, never video streams, from START channel."""
    matches = list(re.finditer(
        r'<div\s+id="[^"]+"\s+class="tv-programm__item[^"]*"\s+data-timestart="(\d+)"',
        page
    ))
    result = []
    moscow = timezone(timedelta(hours=3))
    for i, match in enumerate(matches):
        segment = page[match.start():matches[i + 1].start() if i + 1 < len(matches)
                       else match.start() + 4000]
        name_match = re.search(r'<div class="tv-programm__item-name">([\s\S]*?)</div>',
                               segment)
        if not name_match:
            continue
        title = unescape(re.sub(r"<[^>]*>", "", name_match.group(1))).strip()
        if not re.match(r"^Футбол\.", title, flags=re.I) or " - " not in title:
            continue
        stamp = int(match.group(1))
        when = datetime.fromtimestamp(stamp, tz=moscow)
        result.append({
            "id": "start-" + str(stamp),
            "date": when.date().isoformat(),
            "timeMsk": when.strftime("%H:%M"),
            "title": title,
            "channelId": "start",
            "live": "tv-programm__item-live" in segment and "Прямой эфир" in segment,
            "sourceUrl": url,
            "commentary": "unknown",
            "access": "unknown"
        })
    return result


def rebuild(now: datetime | None = None, getter=fetch_json,
            destination: Path = OUT, page_getter=fetch_html) -> tuple[bool, dict]:
    now = now or datetime.now(timezone.utc)
    existing = {}
    if destination.exists():
        try:
            existing = json.loads(destination.read_text("utf-8"))
        except (ValueError, OSError):
            existing = {}
    previous = existing.get("fixtures", [])
    if not isinstance(previous, list):
        previous = []
    fixtures = []
    issues = []
    success = 0
    for filename, league in SOURCES.items():
        try:
            season_start = now.year if now.month >= 7 else now.year - 1
            season = str(season_start) + "-" + str(season_start + 1)[-2:]
            source = getter(BASE + season + "/" + filename)
            fixtures.extend(normalize_fixture_list(source, filename, league, now))
            success += 1
        except Exception as exc:
            issues.append(league + ": " + type(exc).__name__)
            # Failed feeds do not erase recently cached fixtures for that league.
            low = (now - timedelta(days=1)).date().isoformat()
            high = (now + timedelta(days=21)).date().isoformat()
            fixtures.extend(f for f in previous if isinstance(f, dict)
                            and f.get("competition") == league and low <= f.get("date", "") <= high)
    if success == 0:
        raise RuntimeError("All sources failed; existing catalog left intact")
    # Official START program is independent of the CC0 season calendar.
    # A public TV listing is NOT a playable feed or proof of free access.
    programs = []
    for day_offset in range(4):
        day = (now + timedelta(days=day_offset)).date()
        url = ("https://ru.tvstart.ru/schedule/start-tv/?day="
               + day.strftime("%d.%m.%Y"))
        try:
            programs.extend(parse_start_programs(page_getter(url), url))
        except Exception as exc:
            issues.append("Старт: " + type(exc).__name__)
    if not programs and any(x.startswith("Старт:") for x in issues):
        programs = [p for p in existing.get("programs", []) if
                    isinstance(p, dict) and p.get("date", "") >= now.date().isoformat()]
    programs = sorted({p["id"]: p for p in programs}.values(),
                      key=lambda p: (p["date"], p["timeMsk"], p["id"]))
    unique = {f["id"]: f for f in fixtures}
    ordered = sorted(unique.values(), key=lambda f: (f["date"], f["competition"], f["id"]))
    result = {
        "schema": 1,
        "generatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "OpenFootball (CC0) — матчи, без подтверждения вещателя или времени начала",
        "fixtures": ordered,
        "programs": programs,
        "issues": issues,
    }
    if (existing.get("fixtures") == ordered and existing.get("programs", []) == programs
            and existing.get("issues") == issues):
        return False, existing
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return True, result


if __name__ == "__main__":
    try:
        changed, data = rebuild()
        print("Sports update:", "changed" if changed else "unchanged",
              "|", len(data.get("fixtures", [])), "fixtures",
              "|", len(data.get("issues", [])), "source errors")
    except Exception as err:
        print("Sports update failed:", err, file=sys.stderr)
        sys.exit(1)
