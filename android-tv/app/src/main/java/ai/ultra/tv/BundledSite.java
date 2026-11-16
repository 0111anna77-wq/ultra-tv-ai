package ai.ultra.tv;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Ships a snapshot of the website inside the APK. Makes the TV UI independent
 * of whether the TV's WebView can reach Cloudflare Pages. External APIs,
 * posters and video embeds still require connectivity.
 */
final class BundledSite {
    private final Context context;

    BundledSite(Context context) { this.context = context.getApplicationContext(); }

    WebResourceResponse serve(Uri url) {
        if (url == null || !"https".equalsIgnoreCase(url.getScheme())
                || !"ultra-tv-ai.pages.dev".equalsIgnoreCase(url.getHost())) return null;

        // TV client refresh requests tagged live=1 must hit the server, not stale assets.
        // All plain requests have a bundled fallback for offline startup.
        if ("1".equals(url.getQueryParameter("live"))) return null;
        String path = url.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";

        // Only serve exactly these app-owned resources. No URL traversal or arbitrary file reads.
        String asset;
        String mime;
        switch (path) {
            case "/index.html": asset = "site/index.html"; mime = "text/html"; break;
            case "/tv.html": asset = "tv.html"; mime = "text/html"; break;
            case "/tv.js": asset = "tv.js"; mime = "application/javascript"; break;
            case "/tv.css": asset = "tv.css"; mime = "text/css"; break;
            case "/tv-catalog.json": asset = "site/tv-catalog.json"; mime = "application/json"; break;
            case "/tv-discover.json": asset = "site/tv-discover.json"; mime = "application/json"; break;
            case "/player.js": asset = "site/player.js"; mime = "application/javascript"; break;
            case "/player.css": asset = "site/player.css"; mime = "text/css"; break;
            case "/watch-options.json": asset = "site/watch-options.json"; mime = "application/json"; break;
            case "/releases.json": asset = "site/releases.json"; mime = "application/json"; break;
            default: return null;
        }

        try {
            InputStream data = context.getAssets().open(asset);
            WebResourceResponse response = new WebResourceResponse(mime, "UTF-8", data);
            response.setResponseHeaders(java.util.Collections.singletonMap("Cache-Control", "no-cache"));
            return response;
        } catch (IOException missingAsset) {
            // Online fallback rather than crashing when the asset is absent.
            return null;
        }
    }
}
