# Ultra TV personal cloud catalog — Phase 1 (STAGED, NOT LIVE)

This branch contains a proposed private sync service for the existing ultra-tv-ai.pages.dev Cloudflare Pages site and the installed TV WebView app. DO NOT publish/update the signed Android APK before confirming a working Cloudflare database and first migration. v0.34 app and site main remain untouched.

## Current issue
index.html stores manual series in ultra-tv-v2.extras in browser localStorage; tv.js stores manually followed shows in tv-manual-added in TV WebView localStorage. The static tv-catalog.json contains 25 shows but not The Flash. Different browser/device local storage is not shared.

## Cloudflare owner setup (required once)
1. Create a D1 database ultra-tv-personal-sync in the Cloudflare account that owns the ultra-tv-ai Pages project.
2. Execute all SQL statements from migrations/0001_personal_sync.sql in the D1 console. Back up user collections before importing.
3. Under Workers & Pages → ultra-tv-ai → Settings → Bindings, add D1 database binding variable ULTRA_SYNC_DB pointing to this new database. Redeploy for changes to take effect.
4. Under Pages project Variables and Secrets, add a SECRET named ULTRA_SYNC_SETUP_SECRET with a long random value of at least 32 characters. Never put it in source code, GitHub or APK, or send it in chat. Store the value in a password manager. Enter it only into the authenticated setup form on the private HTTPS site.
5. Preview bindings should use a separate database or remain intentionally disabled until tested.

Check /api/sync/status. {ready:true} means D1 schema is available. On unconfigured deployment expect ready:false; the legacy app must continue reading local collections.

## Authenticated API
- POST /api/sync/bootstrap + setupKey authenticates owner, issues a random 256-bit bearer token.
- POST /api/sync/pair/start (owner) issues one-time 8-digit pairing code valid 5min.
- POST /api/sync/pair/redeem (TV) exchanges pairing code for TV token. Max ten attempts per five-minute network bucket.
- GET /api/sync/library returns manual shows only, not viewing history.
- POST /api/sync/library updates show metadata and tracked flag with per-row baseRevision optimistic concurrency; 409 includes the current server item.

## Security and migration rules
- Never place setup secret or device token in public repo/assets.
- Browser and TV preserve their existing local state while offline; client queues changes for later.
- Cloud tokens are revocable by setting sync_devices.revoked=1 in D1. Device holders can read/modify the personal library; use only on trusted devices.
- Prefer tvmaze:<numeric_id> as canonical show ID; fallback imdb:<ttid> or key:<key>.
- First connection imports existing manually added shows additively. It MUST NOT replace the complete ultra-tv-v2 object or all tv-* localStorage keys.
- If The Flash was added in a separate preview domain/origin, export its collection from THAT site. Browser localStorage is isolated by origin.

## Other phases, not part of this change
Website already has initemProgress[showKey:SxxEyy]; TV has tv-progress-v1[showKey]. Phase 2 will merge into common watch history without losing per-device data. Initem seek and internal dubbing selection by external control are NOT verified, so Phase 3 must not promise automatic seek/dubbing inside its iframe.

## Rollout
The GitHub-connected Pages production site deploys from main. Keep this change on feature/ultra-tv-shared-library-d1 until database setup and tests pass. This staging branch alone does not turn live synchronization on.
