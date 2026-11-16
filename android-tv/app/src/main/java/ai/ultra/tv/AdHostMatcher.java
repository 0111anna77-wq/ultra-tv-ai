package ai.ultra.tv;

import java.util.Locale;
import java.util.Set;

/** Checks full host labels, never arbitrary substrings of a URL or hostname. */
final class AdHostMatcher {
    private AdHostMatcher() {}

    static boolean isBlockedHost(String hostname, Set<String> blockedDomains) {
        if (hostname == null || blockedDomains == null || blockedDomains.isEmpty()) return false;
        String candidate = hostname.toLowerCase(Locale.ROOT).trim();
        if (candidate.endsWith(".")) candidate = candidate.substring(0, candidate.length() - 1);
        while (!candidate.isEmpty()) {
            if (blockedDomains.contains(candidate)) return true;
            int dot = candidate.indexOf('.');
            if (dot < 0) break;
            candidate = candidate.substring(dot + 1);
        }
        return false;
    }
}
