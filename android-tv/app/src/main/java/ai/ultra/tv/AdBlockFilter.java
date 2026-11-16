package ai.ultra.tv;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Experimental and reversible ad-host filter for the embedded WebView.
 * Does NOT access video URLs or media positions and does not alter the third-party player.
 * Host-only blocking is less powerful than AdGuard's cosmetic/network filters.
 */
final class AdBlockFilter {
    private static final String PREF_NAME = "ultra_tv_settings";
    private static final String PREF_ENABLED = "ad_filter_enabled";
    private final SharedPreferences prefs;
    private final Set<String> blockedDomains;
    private final AtomicInteger blockedCount = new AtomicInteger();
    private volatile boolean enabled;
    private volatile String lastBlockedHost = "";

    AdBlockFilter(Context context) {
        prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        enabled = prefs.getBoolean(PREF_ENABLED, false);
        Set<String> hosts = new HashSet<>();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(
                context.getAssets().open("ad_hosts.txt"), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                line = line.trim().toLowerCase(Locale.ROOT);
                if (!line.isEmpty() && !line.startsWith("#") && line.indexOf(' ') < 0
                        && line.indexOf('/') < 0 && line.indexOf('*') < 0 && line.contains(".")) {
                    hosts.add(line);
                }
            }
        } catch (IOException e) {
            // Fail open: videos are more important than a missing/invalid filter file.
            hosts.clear();
        }
        blockedDomains = Collections.unmodifiableSet(hosts);
    }

    boolean isEnabled() { return enabled; }
    int getBlockedCount() { return blockedCount.get(); }
    int getDomainCount() { return blockedDomains.size(); }
    String getLastBlockedHost() { return lastBlockedHost; }

    void setEnabled(boolean value) {
        enabled = value;
        prefs.edit().putBoolean(PREF_ENABLED, value).apply();
    }

    WebResourceResponse maybeBlock(Uri uri, boolean mainFrame) {
        if (!enabled || mainFrame || uri == null) return null;
        final String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return null;
        final String host = uri.getHost();
        if (!AdHostMatcher.isBlockedHost(host, blockedDomains)) return null;
        blockedCount.incrementAndGet();
        lastBlockedHost = host;
        // Give Chromium an empty response for known ad hosts; leave unknown traffic alone.
        return new WebResourceResponse("text/plain", "UTF-8",
                new ByteArrayInputStream(new byte[0]));
    }
}
