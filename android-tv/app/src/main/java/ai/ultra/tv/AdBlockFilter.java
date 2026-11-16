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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Comparator;
import java.util.concurrent.ConcurrentHashMap;
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
    private final AtomicInteger observedRequests = new AtomicInteger();
    // Diagnostics never retain full URLs, query strings, cookies or IP addresses.
    // Bounded domain statistics help identify ads missed by the host-only filter.
    private final ConcurrentHashMap<String, AtomicInteger> allowedHosts = new ConcurrentHashMap<>();
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
    int getObservedRequests() { return observedRequests.get(); }

    String getUnblockedHostSummary() {
        List<Map.Entry<String,AtomicInteger>> candidates = new ArrayList<>(allowedHosts.entrySet());
        candidates.sort((a,b) -> Integer.compare(b.getValue().get(), a.getValue().get()));
        StringBuilder out = new StringBuilder();
        for (int i=0;i<Math.min(7,candidates.size());i++) {
            Map.Entry<String,AtomicInteger> entry = candidates.get(i);
            out.append("\n").append(entry.getKey()).append(" (")
                    .append(entry.getValue().get()).append(")");
        }
        return out.length()==0?"Нет данных — открой сериал с включённым фильтром":out.toString();
    }

    void setEnabled(boolean value) {
        enabled = value;
        blockedCount.set(0);
        observedRequests.set(0);
        allowedHosts.clear();
        lastBlockedHost = "";
        prefs.edit().putBoolean(PREF_ENABLED, value).apply();
    }

    WebResourceResponse maybeBlock(Uri uri, boolean mainFrame) {
        if (!enabled || mainFrame || uri == null) return null;
        final String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return null;
        final String host = uri.getHost();
        if (host == null || host.isEmpty()) return null;
        observedRequests.incrementAndGet();
        if (!AdHostMatcher.isBlockedHost(host, blockedDomains)) {
            // This list is only a troubleshooting hint, NOT a list of ads:
            // requests include legitimate media, subtitle and image CDNs.
            if (allowedHosts.size() < 60 || allowedHosts.containsKey(host)) {
                allowedHosts.computeIfAbsent(host, h -> new AtomicInteger()).incrementAndGet();
            }
            return null;
        }
        blockedCount.incrementAndGet();
        lastBlockedHost = host;
        // Give Chromium an empty response for known ad hosts; leave unknown traffic alone.
        return new WebResourceResponse("text/plain", "UTF-8",
                new ByteArrayInputStream(new byte[0]));
    }
}
