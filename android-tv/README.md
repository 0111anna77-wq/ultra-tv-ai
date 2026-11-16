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
