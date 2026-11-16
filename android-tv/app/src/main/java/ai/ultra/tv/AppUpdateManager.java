package ai.ultra.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit, user-confirmed self-update, never a silent APK install. */
public final class AppUpdateManager {
    private static final String SITE = "https://ultra-tv-ai.pages.dev";
    private static final String MANIFEST = SITE + "/tv-update.json";
    private static final String APK_URL = SITE + "/a.apk";
    private static final String PREFS = "ultra-tv-apk-updater";
    private static final long AUTO_CHECK_INTERVAL = 24L * 60L * 60L * 1000L;

    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private File pendingInstall;
    private boolean requestingPermission;

    public AppUpdateManager(Activity activity) { this.activity = activity; }

    public void check(boolean manual) {
        if (!busy.compareAndSet(false, true)) {
            if (manual) toast("Проверка или скачивание уже выполняется");
            return;
        }
        if (manual) toast("Проверяем новую версию Ultra TV…");
        worker.execute(() -> {
            try {
                JSONObject release = readManifest();
                int latest = release.getInt("versionCode");
                int current = currentVersion();
                String title = release.optString("versionName", "новая версия");
                String note = release.optString("notes", "");
                if (latest <= current) {
                    if (manual) ui(() -> new AlertDialog.Builder(activity)
                            .setTitle("Ultra TV обновлён")
                            .setMessage("Установлена последняя версия (" + current
                                    + ").\nКаталог сериалов обновляется отдельно, без установки APK.")
                            .setPositiveButton("Хорошо", null).show());
                } else {
                    ui(() -> new AlertDialog.Builder(activity)
                            .setTitle("Доступно обновление Ultra TV")
                            .setMessage("Версия " + title + " (" + latest + ").\n\n"
                                    + note + "\n\nСкачать APK и открыть системную установку?")
                            .setPositiveButton("Скачать и установить", (d, which) -> download(release))
                            .setNegativeButton("Позже", null).show());
                }
            } catch (Exception e) {
                if (manual) ui(() -> showMessage("Проверка обновлений",
                        "Не удалось проверить версию. Проверь интернет/VPN и попробуй снова.\n\n"
                                + briefError(e)));
            } finally {
                busy.set(false);
            }
        });
    }

    public void checkOccasionally() {
        long now = System.currentTimeMillis();
        long last = activity.getSharedPreferences(PREFS, 0).getLong("checkedAt", 0);
        if (now - last < AUTO_CHECK_INTERVAL && now >= last) return;
        activity.getSharedPreferences(PREFS, 0).edit().putLong("checkedAt", now).apply();
        check(false);
    }

    private static String briefError(Exception e) {
        String message = e.getMessage();
        if (message == null || message.isEmpty()) return e.getClass().getSimpleName();
        return message.length() > 145 ? message.substring(0, 145) : message;
    }

    private JSONObject readManifest() throws Exception {
        HttpURLConnection connection = openHttps(MANIFEST + "?t=" + System.currentTimeMillis());
        try (InputStream input = connection.getInputStream()) {
            byte[] bytes = readLimited(input, 32768);
            JSONObject json = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            int version = json.getInt("versionCode");
            String url = json.getString("apkUrl");
            String hash = json.getString("sha256");
            if (version < 1 || !APK_URL.equals(url) || !hash.matches("[0-9a-f]{64}"))
                throw new SecurityException("Некорректный список обновлений");
            return json;
        } finally {
            connection.disconnect();
        }
    }

    private static HttpURLConnection openHttps(String url) throws Exception {
        URL target = new URL(url);
        if (!"https".equals(target.getProtocol())
                || !"ultra-tv-ai.pages.dev".equalsIgnoreCase(target.getHost()))
            throw new SecurityException("Unexpected update host");
        HttpURLConnection connection = (HttpURLConnection) target.openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(25000);
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestProperty("Cache-Control", "no-store");
        int status = connection.getResponseCode();
        if (status != 200) {
            connection.disconnect();
            throw new IllegalStateException("Сервер обновлений: HTTP " + status);
        }
        return connection;
    }

    private static byte[] readLimited(InputStream input, int max) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) >= 0) {
            if (output.size() + count > max) throw new SecurityException("Ответ слишком большой");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private int currentVersion() throws Exception {
        PackageInfo installed = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? (int) installed.getLongVersionCode() : installed.versionCode;
    }

    private void download(JSONObject release) {
        if (!busy.compareAndSet(false, true)) { toast("Загрузка уже идёт"); return; }
        toast("Скачиваем обновление Ultra TV…");
        worker.execute(() -> {
            File output = new File(new File(activity.getCacheDir(), "updates"), "ultra-tv-update.apk");
            File temp = new File(output.getParentFile(), "pending.apk");
            try {
                if (!output.getParentFile().exists() && !output.getParentFile().mkdirs())
                    throw new IllegalStateException("Нет доступа к папке обновлений");
                if (temp.exists()) temp.delete();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                HttpURLConnection connection = openHttps(APK_URL + "?t=" + System.currentTimeMillis());
                try (InputStream input = connection.getInputStream();
                     FileOutputStream stream = new FileOutputStream(temp)) {
                    byte[] buffer = new byte[32768];
                    int length; long total = 0;
                    while ((length = input.read(buffer)) != -1) {
                        total += length;
                        if (total > 120L * 1024L * 1024L)
                            throw new SecurityException("APK превышает допустимый размер");
                        digest.update(buffer, 0, length);
                        stream.write(buffer, 0, length);
                    }
                    stream.getFD().sync();
                    if (total < 10000L) throw new SecurityException("Загруженный APK слишком мал");
                } finally {
                    connection.disconnect();
                }
                String hash = toHex(digest.digest());
                if (!hash.equals(release.getString("sha256")))
                    throw new SecurityException("Контрольная сумма APK не совпадает");
                if (!checkArchive(temp, release.getInt("versionCode")))
                    throw new SecurityException("APK не подходит для Ultra TV AI");
                if (output.exists()) output.delete();
                if (!temp.renameTo(output)) throw new IllegalStateException("Не удалось сохранить обновление");
                pendingInstall = output;
                if (!sameSigner(output)) {
                    ui(() -> new AlertDialog.Builder(activity)
                            .setTitle("Для обновления нужна одинаковая подпись")
                            .setMessage("Сборки подписаны разными ключами. Android не позволит обновить "
                                    + "приложение поверх установленного. Это ограничение Android, "
                                    + "а не ошибка скачивания.\n\n"
                                    + "Для этой тестовой сборки потребуется удалить старую версию "
                                    + "и установить новую через браузер. При удалении локальные "
                                    + "настройки могут потеряться. Для следующих версий "
                                    + "нужно закрепить постоянный ключ подписи.")
                            .setPositiveButton("Открыть APK в браузере", (d, w) -> openExternalDownload())
                            .setNegativeButton("Закрыть", null).show());
                } else {
                    ui(() -> new AlertDialog.Builder(activity)
                            .setTitle("Обновление скачано")
                            .setMessage("APK проверен. Перейти к системной установке? "
                                    + "Android попросит подтвердить обновление.")
                            .setPositiveButton("Установить", (d, w) -> installDownloaded())
                            .setNegativeButton("Позже", null).show());
                }
            } catch (Exception e) {
                temp.delete();
                ui(() -> showMessage("Ошибка загрузки",
                        "Не удалось скачать или проверить обновление.\n\n" + briefError(e)));
            } finally { busy.set(false); }
        });
    }

    private boolean checkArchive(File apk, int minVersion) {
        try {
            PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            if (info == null || !activity.getPackageName().equals(info.packageName)) return false;
            int version = Build.VERSION.SDK_INT >= 28 ? (int) info.getLongVersionCode() : info.versionCode;
            return version >= minVersion && version > currentVersion();
        } catch (Exception e) { return false; }
    }

    @SuppressWarnings("deprecation")
    private boolean sameSigner(File apk) {
        try {
            PackageManager pm = activity.getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28
                    ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo existing = pm.getPackageInfo(activity.getPackageName(), flags);
            PackageInfo incoming = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
            if (incoming == null) return false;
            Signature[] a = Build.VERSION.SDK_INT >= 28
                    ? existing.signingInfo.getApkContentsSigners() : existing.signatures;
            Signature[] b = Build.VERSION.SDK_INT >= 28
                    ? incoming.signingInfo.getApkContentsSigners() : incoming.signatures;
            if (a == null || b == null || a.length != b.length || a.length == 0) return false;
            return Arrays.equals(a, b);
        } catch (Exception e) { return false; }
    }

    private void installDownloaded() {
        if (pendingInstall == null || !pendingInstall.isFile()) {
            showMessage("Файл не найден", "Сначала скачай обновление ещё раз");
            return;
        }
        if (Build.VERSION.SDK_INT >= 26
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            requestingPermission = true;
            new AlertDialog.Builder(activity)
                    .setTitle("Разрешение Android")
                    .setMessage("Чтобы запустить обновление из Ultra TV, разреши "
                            + "установку приложений из этого источника. "
                            + "После возврата установщик откроется автоматически. "
                            + "Если MTS блокирует такое разрешение, используй браузер.")
                    .setPositiveButton("Открыть разрешения", (dialog, which) -> {
                        try {
                            activity.startActivity(new Intent(
                                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + activity.getPackageName())));
                        } catch (Exception e) {
                            requestingPermission = false;
                            showMessage("Установка ограничена",
                                    "Приставка не открывает разрешения. Используй загрузку через браузер.");
                        }
                    })
                    .setNegativeButton("Отмена", (dialog, which) -> requestingPermission = false)
                    .show();
            return;
        }
        requestingPermission = false;
        Uri uri = UpdateApkProvider.UPDATE_URI;
        Intent installer = new Intent(Intent.ACTION_VIEW);
        installer.setDataAndType(uri, "application/vnd.android.package-archive");
        installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installer.setClipData(ClipData.newUri(activity.getContentResolver(), "Ultra TV update", uri));
        try {
            activity.startActivity(installer);
        } catch (ActivityNotFoundException e) {
            showMessage("Системный установщик недоступен",
                    "MTS не позволяет запустить установку из Ultra TV. "
                    + "Попробуй установить файл через браузер приставки.");
        } catch (SecurityException e) {
            showMessage("Установка запрещена", "Система блокирует этот источник установки.");
        }
    }

    public void onResume() {
        if (!requestingPermission) return;
        if (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls()) {
            installDownloaded();
        }
    }

    public void shutdown() { worker.shutdownNow(); }

    private void openExternalDownload() {
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(APK_URL)));
        } catch (Exception e) {
            showMessage("Загрузка", "Открой в браузере: " + APK_URL);
        }
    }

    private static String toHex(byte[] data) {
        StringBuilder out = new StringBuilder(data.length * 2);
        for (byte b : data) out.append(String.format(Locale.US, "%02x", b & 255));
        return out.toString();
    }

    private void toast(String message) { ui(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()); }
    private void ui(Runnable runnable) { activity.runOnUiThread(runnable); }
    private void showMessage(String title, String message) {
        ui(() -> new AlertDialog.Builder(activity).setTitle(title).setMessage(message)
                .setPositiveButton("Понятно", null).show());
    }
}
