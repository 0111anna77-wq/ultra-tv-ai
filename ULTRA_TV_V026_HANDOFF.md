# Ultra TV 0.26 — KION banner full bleed and sidebar U sizing

## Reason / user feedback (20 Nov 2026)
- User installed **0.25** and liked new purple banner but notes that **the entire purple background plus U** is visibly smaller inside the KION selectable tile. Do NOT separately enlarge the letter U or alter its proportions relative to the purple background.
- User also wants purple square icon on the internal left sidebar positioned at **top-left, nearly the full sidebar width**, and toned down slightly in brightness.
- User explicitly wants original slight shade difference between square and landscape designs retained.
- User's KION photo shows visible spare space below the purple banner relative to other apps (this is user's observation; no confident exact KION layout measurement).
- Actual installed `res/drawable/uvideo_tv_banner.png` is 640×360 RGBA. Alpha bbox at threshold 128 is **(15,13)-(624,345)**, meaning only ~95.3% width / 92.5% height is opaque: transparent padding exists before KION may apply its own safe inset.
- Original `purple-u-wide-original.png` 1678×937 RGBA alpha bbox threshold 128 is **(40,32)-(1637,904)**. Need crop excess transparent padding from the **whole original graphic** preserving U-to-background ratio. Example 1552×873 crop x=63,y=32 (1.778 aspect); then resize to 640×360. It is normal for the entire artwork to uniformly fill more space; no independent U increase.
- Strong safety requirement: don't affect player/nav/cart/selection/background; v0.25 was correct.

## Source and work checkpoint
- Base version: v0.25 source tree `feature/ultra-tv-v025-purple-brand-assets`; latest published `main` v0.25 at start.
- Working branch: `feature/ultra-tv-v026-fullbleed-kion-logo`, created from v0.25 source branch.
- Windows local copy: `D:\UltraTVTools\uvideo-tv-v026-work\source\android-tv`; old signed APK: `D:\UltraTVTools\uvideo-tv-v025-work\UVideoTV_v025_signed.apk`.
- Original unedited user graphics: `D:\UltraTVTools\uvideo-tv-v025-work\brand-originals\purple-u-square-original.png` and `purple-u-wide-original.png`. Source screenshots in previous conversation.
- Editable: `android-tv/app/src/main/res/drawable/uvideo_tv_banner.png`, `android-tv/app/src/main/assets/tv.css` (only sidebar U sizing and brightness), `android-tv/app/src/main/assets/tv.html` CSS cache query, `android-tv/app/build.gradle` versionCode 26. **Square icon and square sidebar PNG should remain exactly the same image as 0.25**.
- Release process if tests PASS: Node legacy suite, Chromium D-pad and visual review, Gradle offline + same signing key, ZIP asset diff, publish `a.apk` and `tv-update.json` versionCode 26 to main, verify Cloudflare Pages real HTTP+sha. Keep prior signed v0.25 as rollback. No forced install.

## STATUS
At creation: branch/work copy done. No code modifications yet. Append actual changes/tests/live status as proceeding.


## Actual implementation, build and publication — 20 Nov 2026
- Source code committed to branch `feature/ultra-tv-v026-fullbleed-kion-logo`, **`bcb352b4ab9b60ce3eb91b7f9878d445770f1a89`**, files: drawable banner, CSS, HTML cache query, Gradle version and updated browser tests. Base v0.25. KION banner is **one uniformly cropped and scaled composition**, not a separately enlarged U or recolored design.
- Banner from exact user supplied original file `D:\UltraTVTools\uvideo-tv-v025-work\brand-originals\purple-u-wide-original.png` via FFmpeg `crop=1552:873:63:32,scale=640:360:flags=lanczos,format=rgba`. Output `res/drawable/uvideo_tv_banner.png`, SHA256 `beabc358e9119b5952747aca4aa9ad9cd70b4b74711e20f06390c9de7aadc173`, 209955 bytes. Transparent margins reduced so whole purple background fills more of KION's frame. Any remaining Android TV/KION launcher-created margins require user testing.
- The PNG for sidebar and launcher square **has not been changed**. Only CSS overrides `.tv-sidebar-logo` width/height to `var(--tv-sidebar-width)`, top margin 0, after-logo margin clamp, `img { filter:brightness(.89) }`. The icon fills nearly all sidebar width without interfering with nav.
- HTML CSS cache version updated `tv.css?v=26` (JS URL remains unchanged); versionCode 26 / versionName 0.26-tv-kion-banner-fill. Video player `tv.js`, square U PNG, cosmic background files **unchanged**.
- Chrome visual check screenshots `D:\UltraTVTools\uvideo-tv-v026-work\preview-home-v026.png`, etc.; browser CDP `check-ui-v026.cjs` `CHECKS PASS_ALL`. New checks: U image loaded, flush with top, sidebar width filled, brightness .89, nav below logo, navigation/carosel/search/series/sort scenarios still pass. Legacy 3 Node suites, including 16 Initem tests all PASS.
- Gradle Android build `BUILD SUCCESSFUL` (32 tasks); APK signed with previous cert SHA256 `2aa8316ac1888806e45015b5728aa089e74c91439856cd1ade1264be97d56d47` (signature v2/v3 valid). ZIP verified: all JS/CSS/HTML and icon/banner files match source, square logo and JS unchanged.
- Signed APK `D:\UltraTVTools\uvideo-tv-v026-work\UVideoTV_v026_signed.apk` (837488 bytes), SHA256 `c4331639502270c97b9f629bac497a1dfe456f0731caae3e66ae84a3ffacc33d`. Backup `D:\UltraTV_Safety\local-signed-versions\UVideoTV_v026_signed.apk`.
- **Published to GitHub main** commit `8166f5088a8e449ad73f30600a0266f207ab57b7` (`a.apk`, `tv-update.json`). **Verified live Cloudflare Pages**: `https://ultra-tv-ai.pages.dev/tv-update.json` returns versionCode 26, public `https://ultra-tv-ai.pages.dev/a.apk` SHA256 `c4331639502270c97b9f629bac497a1dfe456f0731caae3e66ae84a3ffacc33d`, `LIVE_MATCH=True`.
- **Untested on real KION:** user's next check should focus whether the *entire purple background* fills the KION launcher selectable tile (not just U), sidebar U fills top-left, and performance remains smooth. Can install over v0.25 without uninstall (same cert). If KION adds launcher-specific padding, the remaining issue may be in launcher rather than PNG, so photograph selected tile before changing unrelated logo sizes.
