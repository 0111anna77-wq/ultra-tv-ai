package ai.ultra.tv;

import android.os.SystemClock;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Opt-in, 2-hour diagnostic link initiated by the TV towards a LAN PC.
 * No ADB, no Android OS control, no persistent credentials, no cloud.
 * Uses raw TCP/HTTP ONLY for a validated private IPv4 target on port 38718.
 * Never accepts arbitrary scripts or Android shell commands.
 */
final class ReverseDebugClient {
    private static final int PORT = 38718;
    private static final long SESSION_MS = 2 * 60 * 60 * 1000L;
    private final UltraTvActivity activity;
    private final RemoteDebugServer diagnostics;
    private volatile boolean enabled;
    private volatile boolean connected;
    private volatile long deadline;
    private volatile String status = "Выключено";
    private volatile String token;
    private volatile String host;
    private Thread worker;

    ReverseDebugClient(UltraTvActivity activity, RemoteDebugServer diagnostics) {
        this.activity = activity;
        this.diagnostics = diagnostics;
    }

    synchronized boolean start(String address, String pairCode) {
        stop();
        if (!privateIPv4(address) || pairCode == null || !pairCode.matches("[0-9]{6}")) {
            status = "Нужен локальный IPv4 ПК и шестизначный код";
            return false;
        }
        host = address;
        enabled = true;
        connected = false;
        deadline = SystemClock.elapsedRealtime() + SESSION_MS;
        status = "Соединение с ПК " + address + "...";
        final String code = pairCode; // Never persisted; retained only until pairing.
        worker = new Thread(() -> run(code), "UltraTV-Reverse-Diagnostics");
        worker.setDaemon(true);
        worker.start();
        return true;
    }

    synchronized void stop() {
        enabled = false;
        connected = false;
        token = null;
        if (worker != null) worker.interrupt();
        worker = null;
        status = "Выключено";
    }

    boolean isRunning() { return enabled && connected && SystemClock.elapsedRealtime() < deadline; }
    boolean isEnabled() { return enabled && SystemClock.elapsedRealtime() < deadline; }
    String getStatus() { return status; }
    String getHost() { return host == null ? "" : host; }

    private void run(String code) {
        try {
            JSONObject pair = new JSONObject(request("POST", "/tv/pair",
                    ("code=" + code).getBytes(StandardCharsets.UTF_8),
                    "application/x-www-form-urlencoded", null));
            if (!enabled) return;
            token = pair.getString("token");
            connected = true;
            status = "ПК подключён. До 2 часов";
            activity.runOnUiThread(() -> android.widget.Toast.makeText(activity,
                    "Ultra TV: ПК подключён", android.widget.Toast.LENGTH_LONG).show());
            long nextState = 0;
            uploadState();
            uploadScreen();
            while (enabled && SystemClock.elapsedRealtime() < deadline) {
                if (SystemClock.elapsedRealtime() >= nextState) {
                    uploadState();
                    nextState = SystemClock.elapsedRealtime() + 2600;
                }
                String reply = request("GET", "/tv/task", null, null, token);
                JSONObject command = new JSONObject(reply);
                String action = command.optString("cmd", "");
                if ("SCREEN".equals(action)) uploadScreen();
                else if ("STATE".equals(action)) uploadState();
                else if ("KEY".equals(action)) {
                    String key = command.optString("key", "");
                    if (key.matches("UP|DOWN|LEFT|RIGHT|OK|BACK|HOME")) {
                        activity.runOnUiThread(() -> activity.remoteAppKey(key));
                    }
                } else if ("TAP".equals(action)) {
                    double x = command.optDouble("x", -1), y = command.optDouble("y", -1);
                    if (Double.isFinite(x) && Double.isFinite(y)
                            && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
                        activity.runOnUiThread(() -> activity.remoteAppTap((float)x, (float)y));
                    }
                }
                Thread.sleep(650);
            }
        } catch (Exception error) {
            if (enabled) {
                String msg = error.getMessage();
                if (msg == null) msg = error.getClass().getSimpleName();
                status = "Ошибка соединения: " + msg.substring(0, Math.min(105, msg.length()));
            }
        } finally {
            connected = false;
            enabled = false;
            token = null;
            if (status.startsWith("ПК подключён")) status = "Сеанс завершён";
        }
    }

    private void uploadState() throws Exception {
        JSONObject state = new JSONObject();
        state.put("appVersion", "0.33");
        state.put("web", new JSONObject(diagnostics.getWebState()));
        state.put("lastJavaScriptError", activity.getLastJsError());
        state.put("lastNetworkError", activity.getLastNetworkError());
        state.put("fullscreen", activity.isTvFullscreen());
        state.put("remainingSeconds", Math.max(0, (deadline - SystemClock.elapsedRealtime()) / 1000));
        request("POST", "/tv/state", state.toString().getBytes(StandardCharsets.UTF_8),
                "application/json", token);
    }

    private void uploadScreen() throws Exception {
        byte[] shot = diagnostics.screenshot();
        if (shot != null && shot.length < 350_000 && enabled) {
            request("POST", "/tv/screen", shot, "image/jpeg", token);
        }
    }

    // Parse dotted decimal itself: never resolve public hosts or VPN DNS.
    static boolean privateIPv4(String ip) {
        if (ip == null || !ip.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) return false;
        try {
            String[] p = ip.split("\\.");
            int[] a = new int[4];
            for (int i = 0; i < 4; i++) {
                a[i] = Integer.parseInt(p[i]);
                if (a[i] < 0 || a[i] > 255) return false;
            }
            return a[0] == 10 || a[0] == 192 && a[1] == 168 ||
                    a[0] == 172 && a[1] >= 16 && a[1] <= 31;
        } catch (Exception ignored) { return false; }
    }

    private String request(String method, String route, byte[] payload,
                           String type, String bearer) throws Exception {
        if (!enabled || SystemClock.elapsedRealtime() >= deadline) throw new Exception("session expired");
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, PORT), 2500);
            s.setSoTimeout(3500);
            OutputStream out = s.getOutputStream();
            StringBuilder headers = new StringBuilder(method + " " + route + " HTTP/1.0\r\n");
            headers.append("Host: ").append(host).append("\r\nConnection: close\r\n");
            if (bearer != null) headers.append("Authorization: Bearer ").append(bearer).append("\r\n");
            if (payload != null) {
                headers.append("Content-Type: ").append(type).append("\r\nContent-Length: ")
                       .append(payload.length).append("\r\n");
            }
            headers.append("\r\n");
            out.write(headers.toString().getBytes(StandardCharsets.US_ASCII));
            if (payload != null) out.write(payload);
            out.flush();
            InputStream in = s.getInputStream();
            ByteArrayOutputStream response = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) != -1) {
                response.write(buf, 0, n);
                if (response.size() > 20_000) throw new Exception("oversized response");
            }
            String raw = response.toString("UTF-8");
            int headerEnd = raw.indexOf("\r\n\r\n");
            if (headerEnd < 0) throw new Exception("bad HTTP reply");
            String line = raw.substring(0, raw.indexOf("\r\n"));
            if (!line.matches("HTTP/1\\.[01] 200.*")) {
                throw new Exception(line.length() > 64 ? line.substring(0, 64) : line);
            }
            return raw.substring(headerEnd + 4);
        }
    }
}
