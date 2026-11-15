#!/usr/bin/env python3
"""One-shot diagnostics for public iframe/provider discovery. No tokens or video saved."""
import json
import re
import urllib.request
import urllib.error
from urllib.parse import urlsplit

urls = [
  'https://api.initem.ws/embed/kp/5512084',
  'https://api.initem.ws/embed/imdb/tt31510819',
  'https://kinobd.net/docs/api-docs.json',
  'https://kinobd.net/api/player/search?query=MobLand',
  'https://api.kinobox.tv/api/players?kinopoisk=5512084',
  'https://pleer.video/5512084.json',
]
for url in urls:
    host = urlsplit(url).hostname
    print('\nPROBE:', host, urlsplit(url).path)
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (compatible; UltraTVSourceProbe/1.0)', 'Accept':'application/json,text/html,*/*'})
        with urllib.request.urlopen(req, timeout=12) as res:
            blob = res.read(500_000)
            content_type = res.headers.get('Content-Type','')
            text = blob.decode('utf-8',errors='replace')
            print('STATUS',res.status,'TYPE',content_type,'BYTES',len(blob),'XFRAME',res.headers.get('X-Frame-Options','-'))
            print('CSP',res.headers.get('Content-Security-Policy','-')[:200])
            print('TITLE',re.search(r'<title[^>]*>([^<]+)',text,re.I).group(1)[:120] if re.search(r'<title[^>]*>([^<]+)',text,re.I) else '-')
            print('COUNTS',json.dumps({w:len(re.findall(w,text,re.I)) for w in ('LostFilm','translation','season','episode','iframe','videoplayer')}))
            if 'json' in content_type.lower():
                try:
                    obj=json.loads(text)
                    print('JSON_TOP_LEVEL_KEYS',list(obj)[:15] if isinstance(obj,dict) else 'list:'+str(len(obj)))
                    if 'api-docs.json' in url and isinstance(obj,dict):
                        print('PLAYER_API_SPEC',json.dumps(obj.get('paths',{}).get('/api/player/search',{}),ensure_ascii=False)[:1700])
                except Exception as e:print('JSON_ERROR',str(e)[:130])
    except Exception as e:
        print('ERROR',type(e).__name__,str(e)[:170])
