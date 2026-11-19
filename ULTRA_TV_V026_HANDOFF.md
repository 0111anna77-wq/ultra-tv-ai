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
