# Ultra TV AI — Android TV APK (preview)

**Status:** source/prototype, not yet tested on the user's hardware.

- Runs the existing HTTPS website `https://ultra-tv-ai.pages.dev/` inside Android WebView with JavaScript/DOM storage.
- Adds a TV launcher entry and landscape fullscreen, supports the hardware D-pad and Back key.
- Handles HTML5 video fullscreen through WebChromeClient.
- Does not modify or download any third-party media; the original iframe controls its own audio, episode menu and playback.
- No account or server authentication is built in yet. Local history in Android WebView is independent of browser history on Xiaomi/PC. **This APK is NOT synchronized across devices yet.**
- The Initem player might behave differently in Android WebView than in Chrome. Device playback requires a real Android TV test. Third-party cookies are enabled to improve compatibility.
- Uses HTTPS only, no file access, blocks automatic popups. APK installation requires the user's approval.

## Build
```
cd android-tv
gradle :app:assembleDebug
```
APK: `app/build/outputs/apk/debug/app-debug.apk`.

An automated GitHub Actions build is in `.github/workflows/build-android-tv.yml`. The test/debug signing key on GitHub's runner is ephemeral: future APKs signed by a different key may require uninstalling the previous test APK. Do not depend on app-local storage for backups until synchronized profiles are implemented.

## Planned cloud sync

Use a secure account/device pairing mechanism with a Cloudflare Worker and D1 database. Store only subscribed series, seen flags, last selected episode, and manual timestamps. Never expose API secrets or playback addresses. The Cloudflare deployment is **not yet connected or provisioned**.

## Tested hardware target
The KION/Jiuzhou DTP2162 (Android TV 11) is the initial intended device. MTS DV8235 is an additional Android TV target. Actual compatibility and sideload behavior remain to be verified on-device.
