# Ultra TV AI — Android TV APK (preview)

**Status:** source/prototype, not yet tested on the user's hardware.

- Runs the existing HTTPS website `https://ultra-tv-ai.pages.dev/` inside Android WebView with JavaScript/DOM storage.
- Adds a TV launcher entry and landscape fullscreen, supports the hardware D-pad and Back key.
- Handles HTML5 video fullscreen through WebChromeClient.
- Does not modify or download any third-party media; the original iframe controls its own audio, episode menu and playback.
- No account or server authentication is built in yet. Local history in Android WebView is independent of browser history on Xiaomi/PC. **This APK is NOT synchronized across devices yet.**
- The Initem player might behave differently in Android WebView than in Chrome. Device playback requires a real Android TV test. Third-party cookies are enabled to improve compatibility.
- Uses HTTPS only, no file access, blocks automatic popups. APK installation requires the user's approval.
- **Experimental ad filter (v0.2):** enabled by default, uses a small bundled list of known ad hostnames and `WebViewClient.shouldInterceptRequest()`. Does NOT filter arbitrary URLs or decrypt video streams and may miss ad videos, especially inline/first-party or `blob:` media. Unlike AdGuard for Yandex, this is a *domain-only prototype* — the user must confirm whether Initem ads disappear on the actual Android TV.
- **On-device switch:** tap the native `AD: ВКЛ` button at the top-right of the app, or press the remote `Menu`/`Settings` key if present. A dialog shows how many requests have been blocked and allows turning the filter off. Toggling reloads the page and interrupts playback. Filter preference persists across app launches.
- **Fail-safe:** if playback fails, disable the filter and try again. The player/provider, episode and translation controls are not modified by the filter. The website itself is unchanged.

## Build
```
cd android-tv
gradle :app:assembleDebug
```
APK: `app/build/outputs/apk/debug/app-debug.apk`.

An automated GitHub Actions build is in `.github/workflows/build-android-tv.yml`. The test/debug signing key on GitHub's runner is ephemeral: future APKs signed by a different key may require uninstalling the previous test APK. Do not depend on app-local storage for backups until synchronized profiles are implemented.

## Platform and sideload cautions

APK is debug-signed by GitHub Actions. The signing certificate changes between runner builds, so a new preview may not install as an update to the previous build. Back up data before uninstalling. Android TV WebView behavior and anti-ad coverage still require device testing.

## Planned cloud sync

Use a secure account/device pairing mechanism with a Cloudflare Worker and D1 database. Store only subscribed series, seen flags, last selected episode, and manual timestamps. Never expose API secrets or playback addresses. The Cloudflare deployment is **not yet connected or provisioned**.

## Tested hardware target
The KION/Jiuzhou DTP2162 (Android TV 11) is the initial intended device. MTS DV8235 is an additional Android TV target. Actual compatibility and sideload behavior remain to be verified on-device.

### v0.4 remote workaround for inaccessible AdBlock button

On KION remote, **hold Back for about 2 seconds**. The native settings dialog opens even while WebView/iframe has focus. A short Back still closes player/navigates as before; Menu/Settings keys also open the dialog when exposed by the remote. The obstructive top-right overlay button was removed. On a fresh install, experimental ad filtering defaults OFF for networking diagnostics. Users can enable it again through the same dialog. Cloudflare-served APK at `/a.apk` should be published with the existing file SHA to overwrite the previous asset.

### v0.6 fast TV remote navigation

The TV D-pad now uses a cached grid/rail focus map rebuilt only when content changes. Repeated single key taps are immediate (removed 110-ms gate); held auto-repeat is capped at 50 ms to prevent runaway focus. Up/down follows adjacent horizontal rails and remembers the previously selected item in each rail. The view only scrolls enough to make the chosen item visible and avoids large focus animations. Android TV remains independently packaged; web catalog updates stay live through `tv-catalog.json`. Verify responsiveness and directional transitions on the actual KION remote; CI only validates build and JS syntax.

### v0.7 — native pointer and performance

The TV client uses TVmaze's medium poster variants instead of huge `original_untouched` images (including converting cached original URLs on read). Expensive backdrop hero blur is disabled. Metadata retrieval no longer re-renders active playback.

Unlike v0.5's DOM cursor which disappeared in native video fullscreen, v0.7 uses an Android View overlay drawn above WebView and HTML5 fullscreen. The TV player button sends a first-party image request to `/_native/pointer?mode=on`, intercepted by the native client. The normal remote's D-pad moves the visible cursor, OK dispatches a real touch into the WebView/fullscreen view, and Back exits. Holding OK for 900 ms is a fallback activation method from anywhere, including a trapped cross-origin iframe. This is best-effort control for a third-party player, not its own internal UI or timecode. Fullscreen behavior and actual touch dispatch still require KION hardware testing.

### v0.8 — fullscreen player and unobtrusive pointer

The dedicated TV player now participates in D-pad navigation: the iframe frame itself can receive focus and pressing OK on it activates native pointer mode. The pointer button also requests fullscreen immediately; if Android WebView refuses HTML5 fullscreen, CSS `tv-maximized` fills the viewport. This avoids trapping vertical scrolling in a half-visible player. Android native pointer no longer draws any persistent instructional banner. The crosshair fades after ~3 seconds of inactivity; the next D-pad arrow makes it visible again. When the crosshair is hidden, the first OK reveals it without clicking invisibly, and a second OK clicks the current position. The fullscreen player has no decorative borders or focus outlines; the nonfullscreen player has a visible focus indicator. Standard Back deactivates pointer mode; a subsequent Back exits fullscreen. Other source/episode controls remain on the nonfullscreen TV page. Actual Initem behavior requires on-device testing.

### v0.10 — simplified TV interface and ad diagnostics

The large promotional billboard at the top of Home was removed; the home page now begins directly with poster rails (Continue Watching, My Series, genres). The player has only Back and Full Screen; Full Screen opens the original third-party iframe together with the native crosshair. Selecting the video frame with the remote also enters that mode. Fullscreen and native pointer modes from v0.9 remain unchanged.

Ad filter remains a curated blocklist, *not* the full AdGuard filtering engine. Turning it on/off now clears WebView cache, exits fullscreen and reloads a clean site to apply the chosen filter mode to a fresh Initem instance. The native AdBlock dialog reports blocked/seen subrequests and a bounded list of domains that were allowed (these may be legitimate media servers; never auto-block them indiscriminately). Common Russian ad service domains added to curated list; no streaming provider domain is blocked. Advertising embedded in the streaming media or served from unknown hosts may still appear. Use an on-TV photo of the diagnostics to refine further.

### v0.11 — personal TV redesign (November 16, 2026)

* The series detail Watch button opens the fullscreen iframe and native pointer directly, without an intermediate half-page player. Leaving the pointer via remote Back returns to details.
* The detail view has a small **⚙ Настройки плеера** button at its lower right. It expands a panel for picking sources before playback; source preference is stored locally on the TV. The old duplicate fullscreen button is not restored.
* The **Сериалы** nav tab now displays a TVMaze forthcoming-episode schedule (up to 60 days, only announced dates) and matching **LostFilm released** episodes via `releases.json.entries`, with clear labels to avoid treating TV broadcast and dub releases as identical events. TVMaze metadata is fetched lazily, cached, and throttled. No dates are invented where no listing exists.
* The **Новинки** tab now displays high-rated, externally verified TVMaze recommendations from shared `tv-discover.json` instead of reordering the 25 existing series. Existing collection titles are excluded. A recommended title can be added locally to the TV collection; personal additions are not yet synced between devices.
* **Настройки** now uses compact rows suitable for TV navigation. The unnecessary TVmaze/provider attribution line at the bottom of each series description is removed.
* Shared main site catalog remains authoritative and refreshable; new discovery data has an APK fallback. Package updates continue to be signed with the stable local key (NOT the debug key).

### v0.12 — Continue Watching & TV history

* Keeps a local, per-series watch history (`tv-progress-v1` in WebView localStorage) with most recently opened show, selected source and manually remembered season/episode.
* Home's **▶ Продолжить просмотр** now uses this history rather than treating every detail-card open as playback; selecting a poster opens the fullscreen player directly.
* On series details, a compact control marks the most recently watched season/episode. Initem is an **external cross-origin iframe**: Ultra TV cannot safely read Initem's actual selected episode or timecode, and cannot guarantee that an Initem-selected episode will automatically resume. The manual marker is explicitly labeled.
* When the source is a direct HTML5 video (`mp4`/`webm`), Ultra TV saves time/duration at most every five seconds and on pause, and restores the saved position on the same media URL provided it is not nearly finished. Exact time tracking is intentionally **not claimed for Initem**.
* Existing history is retained locally across normal in-place signed APK updates. Clearing Android app data, uninstalling the app or removing WebView storage may delete it.

### v0.13 — компактный экран и работающий выбор серии Initem

- Удалена лишняя кнопка «Назад» из карточки сериала: аппаратный Back продолжает работать.
- Уменьшены обложки на 20%, удалена отдельная секция «Недавно открытые».
- Детали сериала и отметка серии собраны в компактный экран без необходимости прокручивать его ради основных кнопок.
- Действия в одну строку: «▶ Смотреть / Продолжить», иконка «＋▤» добавления в каталог и «⚙» настроек источника. Все иконки имеют доступные `aria-label`.
- Добавлена локальная и загружаемая с сайта таблица русских кратких аннотаций для сериалов из общего каталога и подборки.
- Проверены реальные ответы HTML Initem: параметры URL `?season=1&episode=2` переводят `playlist.current` в S01E02. Параметры `?s=1&e=2` НЕ работают. Теперь когда пользователь нажимает «Запомнить серию», последующая кнопка «Продолжить просмотр» открывает Initem с этим сезоном/эпизодом. Это **поддерживаемый ответом поставщика входной параметр**, а не получение данных о том, что пользователь реально выбрал внутри iframe.
- Автоматически прочитать изменение выбранной серии и минуты из cross-origin Initem пока нельзя: в проверенном HTML не найден внешний `postMessage` с таймкодом. Внутреннее запоминание VenomPlayer может работать отдельно, но Ultra TV не может его подтверждать. Для прямых видеофайлов работает собственный HTML5 timecode.

### v0.14 — automatic Initem episode and watch-time capture

Initem's own third-party `/js/listen-player.js` was inspected (2026-11-17).
It explicitly calls `parent.postMessage` with
`{event:'changeEpisode', season, episode, id}` on a playlist selection, and
`{event:'viewProgress',time,duration,id}` while watching. Previously these
existing messages were not consumed.

The native TV UI now listens for exactly these messages **without injecting
JavaScript into the third-party player**. For security, the message must originate
from the actual current iframe (`event.source===iframe.contentWindow`) and
from the exact expected `https://api.initem.ws` origin; other frames and
events are ignored. The app persists the automatically selected season,
episode, playback timestamp and total duration in its existing private
`tv-progress-v1` localStorage, and updates the home "Continue" badge.
On changing episodes, the previous episode's position is cleared. Ad playback
events are ignored, impossible durations are discarded, and unconfirmed
episodes aren't guessed as S01E01.

When selecting Continue again, a remembered episode is passed back as
`?season=N&episode=N`. The elapsed minute is **displayed and preserved**,
but automatically seeking to that precise minute is *not yet verified*:
the inspected player emits progress messages but no confirmed inbound seek
command. Therefore exact-minute resume is a subsequent research task,
not part of the shipped claim.

Regression checks:
`node android-tv/tests/initem-progress.test.cjs`.
The checks use a fake iframe, validate exact origin/source, progress storage,
episode resets, ad handling and unknown-episode fallback. Physical TV playback
still requires device validation; do not claim a real-TV pass from CI alone.
