# Ultra TV AI Android TV — stable signing and self-updates

## User-facing behavior

- In the TV app, **Настройки → Проверить обновление приложения** performs an HTTPS version check.
- `https://ultra-tv-ai.pages.dev/tv-update.json` contains `versionCode`, `versionName`, `apkUrl`, `sha256` and Russian release notes.
- If `versionCode` exceeds installed version, user may download `a.apk`, confirm its SHA-256 and same package name, and authorize Android's **system package installer**. This is never a silent install.
- Install from unknown sources may need to be enabled specifically for Ultra TV on KION. MTS may block the permission; browser sideload is the fallback.
- The app preflights the APK **signing certificate**. If it differs from the installed certificate, Android cannot update in place; the app explains the need for a one-time uninstall. **Never use ad-hoc GitHub debug signatures for public updates.**

## Release signing identity (from 0.9)

The public Android app's stable signing certificate fingerprint is:

`SHA-256: 2aa8316ac1888806e45015b5728aa089e74c91439856cd1ade1264be97d56d47`

The **private** signing keystore is only on the authorized user's own PC:

- `D:\UltraTVTools\signing\ultra-tv.p12` — PKCS#12 containing a 3072-bit RSA key.
- `D:\UltraTVTools\signing\password.dpapi` — keystore password protected with Windows current-user DPAPI. It is **not** stored in this GitHub repo or in this document.
- Portable Java 17 and Android build-tools 35 are stored in `D:\UltraTVTools\java` and `D:\UltraTVTools\android\android-15`. This setup did not install system-wide Java or modify system PATH.
- Take a secure backup of the signing key and a recoverable copy of its password (under user control). A Windows DPAPI blob alone may become unusable after reinstalling Windows.
- Do not regenerate or replace this signing key for new versions. Android requires an identical signing cert for in-place upgrades.

## Release procedure for future versions (important)

1. Commit versionCode increment and app changes to `feature/android-tv-app`. GitHub Actions `build-android-tv.yml` **only builds/uploads a development APK**; it no longer auto-publishes an APK to Cloudflare because the ephemeral GitHub runner debug key changes between runs.
2. Download the CI development APK to the authorized PC and use `D:\UltraTVTools\android\android-15\apksigner.bat` with `D:\UltraTVTools\signing\ultra-tv.p12` to sign it **using the existing DPAPI-protected password**. Use `JAVA_HOME=D:\UltraTVTools\java\jdk-17.0.21+9-jre` in the process environment.
3. Verify with `apksigner verify --verbose --print-certs`. Require v2/v3 verification and the exact fingerprint above.
4. Calculate SHA256 of the **signed** APK. Atomically publish the binary to `main:a.apk` and matching `main:tv-update.json` using the GitHub Git data API (binary blob upload with `encoding=base64`, new tree + commit, fast-forward main). **Do not publish an unsigned or randomly signed APK.**
5. Check that Cloudflare Pages serves both URLs with HTTP 200, and that their bytes/hash match. Optionally refresh the LAN `tv.apk` on the user's Windows PC (`%TEMP%\UltraTV-Transfer\tv.apk`) so the TV browser can install locally.
6. Test on KION: press Settings > Check app update in the previously installed signed version; download, grant installation permission if needed, accept Android installer, confirm local catalog/settings survive.

## Why v0.8 → v0.9 still needs an uninstall

Versions through v0.8 were debug-signed by ephemeral GitHub-hosted runners, with differing certificates. The newly stable-signed v0.9 cannot be installed directly over them. This is a **one-time transition**. Once the user installs stable-signed v0.9, subsequent APKs signed with the same private key can be upgraded in place (subject to KION unknown-app-source policy).

Catalog changes continue to work without APK updates through `tv-catalog.json` and `watch-options.json`.
