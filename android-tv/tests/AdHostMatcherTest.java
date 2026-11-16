package ai.ultra.tv;

import java.util.Set;

/** Pure-Java smoke test, no Android emulator needed. */
public final class AdHostMatcherTest {
    public static void main(String[] args) {
        Set<String> hosts = Set.of("doubleclick.net", "adsrvr.org", "exosrv.com");
        check("doubleclick.net", true, hosts);
        check("ad.doubleclick.net", true, hosts);
        check("AD.DOUBLECLICK.NET", true, hosts);
        check("ad.doubleclick.net.", true, hosts);
        check("notdoubleclick.net", false, hosts);
        check("doubleclick.net.evil.example", false, hosts);
        check("api.initem.ws", false, hosts);
        check("ultra-tv-ai.pages.dev", false, hosts);
        check("rutube.ru", false, hosts);
        check(null, false, hosts);
        System.out.println("AdHostMatcher: 10/10 PASS");
    }
    private static void check(String host, boolean expected, Set<String> domains) {
        boolean actual = AdHostMatcher.isBlockedHost(host, domains);
        if (actual != expected) {
            throw new AssertionError(host + ": expected " + expected + ", got " + actual);
        }
    }
}
