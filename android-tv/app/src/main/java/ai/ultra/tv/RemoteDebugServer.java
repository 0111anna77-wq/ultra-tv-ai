package ai.ultra.tv;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.webkit.WebView;
import org.json.JSONObject;
import org.json.JSONException;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Consent-based, temporary app-only LAN diagnostic server.
 * It is NOT Android debugging/ADB and cannot inspect the OS or other apps.
 * OFF by default; started from a native TV dialog, expires after 2 hours.
 * Binds only to a private Wi-Fi/Ethernet interface; no cloud or port forwarding.
 */
final class RemoteDebugServer {
    private static final long MAX_MS = 2 * 60 * 60 * 1000L;
    private static final int MAX_TRIES = 5;
    private final UltraTvActivity activity;
    private final WebView view;
    private final SecureRandom random = new SecureRandom();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile ServerSocket socket;
    private volatile boolean enabled;
    private volatile String pin;
    private volatile String token;
    private volatile long deadline;
    private volatile int failures;
    private volatile long lastUiPingMs;
    private volatile InetAddress bindAddress;

    RemoteDebugServer(UltraTvActivity activity, WebView view) {
        this.activity = activity;
        this.view = view;
    }

    synchronized boolean start() {
        stop();
        try {
            InetAddress local = findLanAddress();
            if (local == null) return false;
            ServerSocket server = new ServerSocket(0, 4, local);
            server.setSoTimeout(950);
            socket = server;
            bindAddress = local;
            pin = String.format(Locale.US, "%06d", random.nextInt(1_000_000));
            byte[] entropy = new byte[32];
            random.nextBytes(entropy);
            token = hex(entropy);
            deadline = SystemClock.elapsedRealtime() + MAX_MS;
            failures = 0;
            enabled = true;
            Thread worker = new Thread(() -> serve(server), "UltraTV-LAN-Diagnostics");
            worker.setDaemon(true);
            worker.start();
            return true;
        } catch (Exception e) {
            stop();
            return false;
        }
    }

    synchronized void stop() {
        enabled = false;
        pin = null;
        token = null;
        deadline = 0;
        bindAddress = null;
        ServerSocket existing = socket;
        socket = null;
        if (existing != null) try { existing.close(); } catch (Exception ignored) { }
    }

    boolean isRunning() { return enabled && !expired() && socket != null && !socket.isClosed(); }
    String getPin() { return isRunning() ? pin : ""; }
    String getAddress() {
        ServerSocket s = socket;
        InetAddress a = bindAddress;
        return isRunning() && s != null && a != null ?
                "http://" + a.getHostAddress() + ":" + s.getLocalPort() + "/" : "";
    }
    long remainingSeconds() {
        return isRunning() ? Math.max(0, (deadline - SystemClock.elapsedRealtime()) / 1000L) : 0;
    }
    private boolean expired() { return SystemClock.elapsedRealtime() >= deadline; }

    private void serve(ServerSocket server) {
        try {
            while (enabled && !expired() && socket == server) {
                try (Socket client = server.accept()) {
                    client.setSoTimeout(1800);
                    if (!isSameSubnet(client.getInetAddress(), bindAddress)) continue;
                    handle(client);
                } catch (SocketTimeoutException ignored) {
                } catch (Exception ignored) {
                    // Unexpected client requests must never crash the TV UI.
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (socket == server) stop();
        }
    }

    private static InetAddress findLanAddress() {
        try {
            Enumeration<NetworkInterface> nics = NetworkInterface.getNetworkInterfaces();
            InetAddress ethernet = null;
            while (nics != null && nics.hasMoreElements()) {
                NetworkInterface nic = nics.nextElement();
                if (!nic.isUp() || nic.isLoopback() || nic.isVirtual()) continue;
                String name = nic.getName().toLowerCase(Locale.ROOT);
                if (!name.startsWith("wlan") && !name.startsWith("eth")) continue;
                Enumeration<InetAddress> addresses = nic.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress ip = addresses.nextElement();
                    if (!(ip instanceof Inet4Address) || !ip.isSiteLocalAddress()) continue;
                    if (name.startsWith("wlan")) return ip;
                    if (ethernet == null) ethernet = ip;
                }
            }
            return ethernet;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isSameSubnet(InetAddress client, InetAddress tv) {
        if (!(client instanceof Inet4Address) || !(tv instanceof Inet4Address)) return false;
        byte[] a = client.getAddress(), b = tv.getAddress();
        return a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
    }

    private static class Request {
        String method = "", path = "";
        final Map<String,String> headers = new HashMap<>();
        String body = "";
    }

    private Request read(Socket client) throws Exception {
        InputStream input = client.getInputStream();
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        int state = 0, byteValue;
        while ((byteValue = input.read()) != -1) {
            if (raw.size() >= 8192) return null;
            raw.write(byteValue);
            if (state == 0 && byteValue == '\r') state = 1;
            else if (state == 1 && byteValue == '\n') state = 2;
            else if (state == 2 && byteValue == '\r') state = 3;
            else if (state == 3 && byteValue == '\n') break;
            else state = 0;
        }
        String[] lines = raw.toString("UTF-8").split("\r\n");
        if (lines.length < 1) return null;
        String[] first = lines[0].split(" ");
        if (first.length < 3) return null;
        Request request = new Request();
        request.method = first[0];
        request.path = first[1];
        for (int i = 1; i < lines.length; i++) {
            int sep = lines[i].indexOf(':');
            if (sep > 0) request.headers.put(lines[i].substring(0, sep).toLowerCase(Locale.ROOT),
                    lines[i].substring(sep + 1).trim());
        }
        if ("POST".equals(request.method)) {
            int length;
            try { length = Integer.parseInt(request.headers.getOrDefault("content-length", "-1")); }
            catch (NumberFormatException e) { return null; }
            if (length < 0 || length > 512) return null;
            byte[] body = new byte[length];
            int count = 0;
            while (count < length) {
                int n = input.read(body, count, length - count);
                if (n < 0) return null;
                count += n;
            }
            request.body = new String(body, StandardCharsets.UTF_8);
        }
        return request;
    }

    private static String field(String body, String key) {
        for (String part : body.split("&")) {
            int sep = part.indexOf('=');
            if (sep < 0) continue;
            if (!key.equals(part.substring(0, sep))) continue;
            try { return URLDecoder.decode(part.substring(sep + 1), "UTF-8"); }
            catch (Exception ignored) { return ""; }
        }
        return "";
    }

    private static boolean matches(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
    private static String hex(byte[] bytes) {
        StringBuilder s = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) s.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return s.toString();
    }

    private void handle(Socket client) throws Exception {
        Request req = read(client);
        if (req == null || !isRunning()) {
            send(client, 400, "application/json", "{\"error\":\"invalid request\"}".getBytes(StandardCharsets.UTF_8));
            return;
        }
        if (!req.path.matches("/(pair|state|screen|key|tap)?") || !("GET".equals(req.method) || "POST".equals(req.method))) {
            sendJson(client, 404, "not found"); return;
        }
        String origin = req.headers.get("origin");
        if (origin != null && !origin.equals(getAddress().replaceAll("/$", ""))) {
            sendJson(client, 403, "invalid origin"); return;
        }
        if ("/".equals(req.path) && "GET".equals(req.method)) {
            send(client, 200, "text/html; charset=utf-8", dashboard().getBytes(StandardCharsets.UTF_8));
            return;
        }
        if ("/pair".equals(req.path) && "POST".equals(req.method)) {
            if (failures >= MAX_TRIES) { stop(); sendJson(client, 403, "session closed"); return; }
            if (!matches(field(req.body, "pin"), pin)) {
                failures++;
                if (failures >= MAX_TRIES) stop();
                sendJson(client, 403, "incorrect code"); return;
            }
            JSONObject ok = new JSONObject();
            ok.put("token", token);
            ok.put("expiresIn", remainingSeconds());
            send(client, 200, "application/json", ok.toString().getBytes(StandardCharsets.UTF_8));
            return;
        }
        String supplied = req.headers.get("authorization");
        if (supplied == null || !supplied.startsWith("Bearer ") || !matches(supplied.substring(7), token)) {
            sendJson(client, 401, "pair on TV first"); return;
        }
        if ("/state".equals(req.path) && "GET".equals(req.method)) {
            JSONObject status = new JSONObject();
            status.put("remainingSeconds", remainingSeconds());
            status.put("appVersion", "0.28");
            status.put("web", new JSONObject(getWebState()));
            status.put("uiReplyMs", lastUiPingMs);
            status.put("lastJavaScriptError", activity.getLastJsError());
            status.put("lastNetworkError", activity.getLastNetworkError());
            status.put("fullscreen", activity.isTvFullscreen());
            send(client, 200, "application/json", status.toString().getBytes(StandardCharsets.UTF_8));
            return;
        }
        if ("/screen".equals(req.path) && "GET".equals(req.method)) {
            byte[] data = screenshot();
            if (data == null) sendJson(client, 503, "screen unavailable");
            else send(client, 200, "image/jpeg", data);
            return;
        }
        if ("/key".equals(req.path) && "POST".equals(req.method)) {
            String k = field(req.body, "key");
            if (!k.matches("UP|DOWN|LEFT|RIGHT|OK|BACK|HOME")) {
                sendJson(client, 400, "invalid app key"); return;
            }
            main.post(() -> activity.remoteAppKey(k));
            send(client, 200, "application/json", "{\"ok\":true}".getBytes(StandardCharsets.UTF_8));
            return;
        }
        if ("/tap".equals(req.path) && "POST".equals(req.method)) {
            // Coordinates refer to the current app view only. No Android OS access.
            try {
                float x = Float.parseFloat(field(req.body, "x"));
                float y = Float.parseFloat(field(req.body, "y"));
                if (!Float.isFinite(x) || !Float.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new IllegalArgumentException();
                main.post(() -> activity.remoteAppTap(x, y));
                send(client, 200, "application/json", "{\"ok\":true}".getBytes(StandardCharsets.UTF_8));
                return;
            } catch (RuntimeException ignored) {
                sendJson(client, 400, "bad coordinates"); return;
            }
        }
        sendJson(client, 405, "method not allowed");
    }

    String getWebState() {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>("{}");
        final long started = SystemClock.elapsedRealtime();
        main.post(() -> {
            try {
                view.evaluateJavascript("(function(){try{var e=document.activeElement;var s=(window.UltraTVDiagnostics?window.UltraTVDiagnostics():{});"+
                        "return JSON.stringify({page:s.page||'unknown',focus:(e?.getAttribute('data-focus')||e?.getAttribute('data-nav')||e?.getAttribute('data-act')||e?.tagName||'').slice(0,80),"+
                        "title:(document.querySelector('#content h1')?.textContent||'').slice(0,100),"+
                        "scrollY:Math.round(window.scrollY),readyState:document.readyState,"+
                        "domNodes:document.getElementsByTagName('*').length,resources:performance.getEntriesByType('resource').length,"+
                        "navMs:s.navMs||0,wheelMs:s.wheelMs||0,lastMove:s.lastMove||'',navMaxMs:s.navMaxMs||0,renderMs:s.renderMs||0,renderMaxMs:s.renderMaxMs||0,season:s.season||1,episode:s.episode||1,source:s.source||0});}catch(e){return '{}';}})()",
                        result -> { lastUiPingMs = SystemClock.elapsedRealtime() - started; value.set(result); done.countDown(); });
            } catch (Exception ignored) { done.countDown(); }
        });
        try { done.await(1400, TimeUnit.MILLISECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        try {
            // evaluateJavascript serializes returned JSON string as a JSON string value.
            String quoted = value.get();
            return new org.json.JSONArray("[" + quoted + "]").getString(0);
        } catch (Exception ignored) { return "{}"; }
    }

    byte[] screenshot() {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<byte[]> value = new AtomicReference<>();
        main.post(() -> {
            try {
                int w = view.getWidth(), h = view.getHeight();
                if (w <= 0 || h <= 0) return;
                int targetW = Math.min(w, 960), targetH = Math.max(1, h * targetW / w);
                Bitmap bmp = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.RGB_565);
                Canvas canvas = new Canvas(bmp);
                canvas.drawColor(0xff16141d);
                canvas.scale(targetW / (float)w, targetH / (float)h);
                view.draw(canvas);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, 65, out);
                value.set(out.toByteArray());
                bmp.recycle();
            } catch (Exception ignored) {
            } finally { done.countDown(); }
        });
        try { done.await(1600, TimeUnit.MILLISECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        return value.get();
    }

    private static void sendJson(Socket client, int code, String message) throws Exception {
        JSONObject obj = new JSONObject();
        obj.put("error", message);
        send(client, code, "application/json", obj.toString().getBytes(StandardCharsets.UTF_8));
    }
    private static void send(Socket client, int code, String type, byte[] bytes) throws Exception {
        String phrase = code == 200 ? "OK" : code == 401 ? "Unauthorized" : "Error";
        String headers = "HTTP/1.1 " + code + " " + phrase + "\r\n" +
                "Content-Type: " + type + "\r\n" +
                "Content-Length: " + bytes.length + "\r\n" +
                "Cache-Control: no-store\r\n" +
                "X-Content-Type-Options: nosniff\r\n" +
                "X-Frame-Options: DENY\r\n" +
                "Referrer-Policy: no-referrer\r\n" +
                "Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'\r\n" +
                "Connection: close\r\n\r\n";
        OutputStream output = client.getOutputStream();
        output.write(headers.getBytes(StandardCharsets.US_ASCII));
        output.write(bytes);
        output.flush();
    }

    private static String dashboard() {
        return "<!doctype html><html lang='ru'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"+
            "<title>Ultra TV · LAN-диагностика</title><style>"+
            "body{background:#19171f;color:#f4f0f8;font:16px system-ui;margin:22px auto;max-width:900px;padding:0 14px}"+
            "button,input{font:inherit;padding:10px;border-radius:9px;border:0;background:#403249;color:white;margin:5px}"+
            "button:focus{outline:2px solid #b19ac4}button:hover{background:#5b4867}"+
            "img{display:block;width:100%;max-width:850px;border-radius:9px;margin-top:10px}"+
            "pre{white-space:pre-wrap;background:#2b2534;padding:12px;border-radius:9px;overflow-wrap:anywhere}"+
            "small{color:#c2baca}.row{display:flex;gap:7px;flex-wrap:wrap}#controls{display:none}"+
            "</style><h1>Ultra TV · удалённая отладка</h1>"+
            "<p>Только само приложение, не Android. Сессия отключится автоматически через 2 часа.</p>"+
            "<div id='pair'><label>Код с экрана ТВ <input id='pin' inputmode='numeric' maxlength='6' placeholder='6 цифр'></label>"+
            "<button id='connect'>Подключиться</button></div><p id='message'></p>"+
            "<section id='controls'><div class='row'>"+
            "<button data-k='UP'>↑</button><button data-k='LEFT'>←</button><button data-k='OK'>OK</button>"+
            "<button data-k='RIGHT'>→</button><button data-k='DOWN'>↓</button>"+
            "<button data-k='BACK'>Назад</button><button data-k='HOME'>Главная</button></div>"+
            "<button id='refresh'>Обновить состояние и экран</button><pre id='state'></pre>"+
            "<img id='screen' alt='Экран приложения (видео может быть недоступно)'/>"+
            "<small>Нажатие по снимку направляет касание в приложение. Некоторые защищённые плееры не снимаются.</small>"+
            "</section><script>"+
            "let token='';const msg=document.getElementById('message');"+
            "async function call(path,opt={}){opt.headers={...(opt.headers||{}),...(token?{Authorization:'Bearer '+token}:{})};"+
            "const r=await fetch(path,opt);if(!r.ok)throw Error('HTTP '+r.status);return r;}"+
            "document.getElementById('connect').onclick=async()=>{try{const r=await call('/pair',{method:'POST',"+
            "headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'pin='+encodeURIComponent(document.getElementById('pin').value)});"+
            "token=(await r.json()).token;document.getElementById('pin').value='';"+
            "document.getElementById('pair').style.display='none';document.getElementById('controls').style.display='block';"+
            "msg.textContent='Подключено. Только локальная сеть.';await refresh();}catch(e){msg.textContent='Подключение отклонено ('+e.message+')';}};"+
            "async function send(k){try{await call('/key',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},"+
            "body:'key='+encodeURIComponent(k)});setTimeout(refresh,200)}catch(e){msg.textContent=e.message}}"+
            "document.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>send(b.dataset.k));"+
            "async function refresh(){try{const r=await call('/state');document.getElementById('state').textContent=JSON.stringify(await r.json(),null,2);"+
            "const im=await call('/screen');const blob=await im.blob();const target=document.getElementById('screen');"+
            "if(target.dataset.url)URL.revokeObjectURL(target.dataset.url);target.dataset.url=URL.createObjectURL(blob);target.src=target.dataset.url;"+
            "}catch(e){msg.textContent='Сессия отключена или сеть недоступна: '+e.message}}"+
            "document.getElementById('refresh').onclick=refresh;"+
            "document.getElementById('screen').onclick=async e=>{const rect=e.currentTarget.getBoundingClientRect();"+
            "const x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;"+
            "try{await call('/tap',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},"+
            "body:'x='+x+'&y='+y});setTimeout(refresh,200)}catch(err){msg.textContent=err.message}};"+
            "</script></html>";
    }
}
