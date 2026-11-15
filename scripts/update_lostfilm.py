#!/usr/bin/env python3
"""Collect public LostFilm episode-release metadata without downloading video.

Errors must never overwrite an existing release list with an empty feed.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

FEED = 'https://www.lostfilm.tv/rss.xml'
OUT = Path(__file__).resolve().parent.parent / 'releases.json'
EP_RE = re.compile(r'\bS\s*(\d{1,2})\s*E\s*(\d{1,3})\b', re.IGNORECASE)
MAX_RESPONSE = 3_000_000
LIMIT = 700


def elem_text(node, name):
    found = node.find(name)
    if found is not None and found.text:
        return found.text.strip()
    for el in node:
        if el.tag.rsplit('}', 1)[-1].lower() == name.lower():
            return (el.text or el.get('href') or '').strip()
    return ''


def safe_release_url(link):
    try:
        parsed = urlparse(link)
        if parsed.scheme != 'https' or parsed.username or parsed.password:
            return ''
        if (parsed.hostname or '').lower() not in ('lostfilm.tv', 'www.lostfilm.tv',
                                                    'lostfilm.download', 'www.lostfilm.download'):
            return ''
        return link[:420]
    except ValueError:
        return ''


def as_utc(value):
    if not value:
        return ''
    try:
        timestamp = parsedate_to_datetime(value)
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        return timestamp.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    except (TypeError, ValueError, IndexError):
        pass
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    except ValueError:
        return ''


def parse_title(title):
    match = EP_RE.search(title)
    if not match:
        return None
    season, episode = int(match.group(1)), int(match.group(2))
    if not (0 < season < 70 and 0 < episode < 400):
        return None
    prefix = title[:match.start()].strip(' () .–—-')
    aliases = re.findall(r'\(([^()]{2,100})\)', prefix)
    english = next((s.strip() for s in aliases if re.search(r'[A-Za-z]', s)), '')
    russian = prefix.split('(', 1)[0].strip(' .–—-')
    if not russian and not english:
        return None
    return {'seriesRu': russian[:120], 'seriesEn': english[:120],
            'season': season, 'episode': episode}


def parse_feed(blob):
    if len(blob) > MAX_RESPONSE:
        raise ValueError('RSS too large')
    root = ET.fromstring(blob)
    items = root.findall('./channel/item')
    if not items:
        items = [item for item in root.iter() if item.tag.rsplit('}', 1)[-1] == 'entry']
    if not items:
        raise ValueError('RSS has no entries: refusing to erase existing data')
    releases = []
    for item in items:
        title = elem_text(item, 'title')[:260]
        meta = parse_title(title)
        if not meta:
            continue
        link = safe_release_url(elem_text(item, 'link'))
        published = as_utc(elem_text(item, 'pubDate') or elem_text(item, 'published')
                           or elem_text(item, 'updated'))
        guid = elem_text(item, 'guid') or elem_text(item, 'id') or link or title
        rid = hashlib.sha256((guid + '\n' + title).encode('utf-8')).hexdigest()[:20]
        releases.append({'id': rid, 'title': title, **meta, 'published': published, 'link': link})
    if not releases:
        raise ValueError('No episode titles matching SxxExx; refusing to replace valid data')
    return releases


def merge(existing, incoming):
    records = {}
    for item in existing.get('entries', []):
        if isinstance(item, dict) and re.fullmatch(r'[a-f0-9]{20}', str(item.get('id', ''))):
            records[item['id']] = item
    for item in incoming:
        records[item['id']] = item
    ordered = sorted(records.values(), key=lambda e: (e.get('published', ''), e.get('id', '')), reverse=True)[:LIMIT]
    if ordered == existing.get('entries') and existing.get('updatedAt'):
        timestamp = existing['updatedAt']
    else:
        timestamp = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    return {'version': 1, 'source': 'LostFilm.tv RSS', 'updatedAt': timestamp, 'entries': ordered}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fixture', help='Read a local XML feed instead of requesting a website')
    parser.add_argument('--output', type=Path, default=OUT)
    args = parser.parse_args()
    if args.fixture:
        blob = Path(args.fixture).read_bytes()
    else:
        request = Request(FEED, headers={
            'User-Agent': 'UltraTV-AI-RSS/1.0 (personal episode notifications)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'})
        with urlopen(request, timeout=25) as response:
            if response.status != 200:
                raise RuntimeError(f'LostFilm RSS HTTP {response.status}')
            blob = response.read(MAX_RESPONSE + 1)
    incoming = parse_feed(blob)
    existing = {}
    if args.output.is_file():
        existing = json.loads(args.output.read_text(encoding='utf-8'))
    updated = merge(existing, incoming)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Read {len(incoming)} episodes; retained {len(updated["entries"])}; newest: {updated["entries"][0]["title"]}')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'RSS update FAILED (existing data preserved): {error}', file=sys.stderr)
        sys.exit(1)
