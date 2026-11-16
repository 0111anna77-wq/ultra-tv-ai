package ai.ultra.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import android.widget.Toast;
import android.widget.FrameLayout;

/**
 * Private Android TV client for the same Ultra TV website.
 * The video iframe is still a separate website: this shell does NOT bypass
 * its restrictions or expose the internal video clock.
 */
public final class UltraTvActivity extends Activity {
    private static final String HOME = "https://ultra-tv-ai.pages.dev/tv.html";
    private FrameLayout container;
    private WebView webView;
    private AdBlockFilter adBlockFilter;
    private BundledSite bundledSite;
    private TvPointerOverlay pointerOverlay;
    private boolean pointerMode;
    private boolean okHeld;
    private boolean longOkTriggered;
    private final Runnable activatePointerOnLongOk = () -> {
        if (okHeld && !pointerMode && !isFinishing()) {
            longOkTriggered = true;
            showNativePointer(.5f, .5f);
        }
    };
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    // Intercept long BACK before the WebView consumes directional/key events.
    private final Handler remoteHandler = new Handler(Looper.getMainLooper());
    private boolean backHeld = false;
    private boolean longBackOpenedSettings = false;
    private final Runnable openSettingsOnLongBack = () -> {
        if (backHeld && !isFinishing()) {
            longBackOpenedSettings = true;
            if (fullscreenView != null) exitFullscreen();
            showFilterDialog();
        }
    };
 
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        container = new FrameLayout(this);
        setContentView(container);
        hideSystemBars();
        adBlockFilter = new AdBlockFilter(this);
        bundledSite = new BundledSite(this);

        webView = new WebView(this);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setBackgroundColor(0xff0d1015);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            settings.setSafeBrowsingEnabled(true);
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                final Uri url = request.getUrl();
                // A tiny same-origin image request bridges the first-party TV
                // buttons to Android. This avoids unsafe JavaScript interfaces.
                if (!request.isForMainFrame()
                        && "https".equalsIgnoreCase(url.getScheme())
                        && "ultra-tv-ai.pages.dev".equalsIgnoreCase(url.getHost())
                        && "/_native/pointer".equals(url.getPath())) {
                    final String mode = url.getQueryParameter("mode");
                    float px = .5f, py = .5f;
                    try {
                        px = Float.parseFloat(url.getQueryParameter("x"));
                        py = Float.parseFloat(url.getQueryParameter("y"));
                    } catch (RuntimeException ignored) { }
                    final float x = px, y = py;
                    runOnUiThread(() -> {
                        if ("on".equals(mode)) showNativePointer(x, y);
                        else if ("off".equals(mode)) hideNativePointer(false);
                    });
                    return new WebResourceResponse("image/gif", "UTF-8",
                            new ByteArrayInputStream(new byte[0]));
                }
                WebResourceResponse local = bundledSite.serve(url);
                if (local != null) return local;
                return adBlockFilter.maybeBlock(request.getUrl(), request.isForMainFrame());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if ("ultratv".equals(uri.getScheme())) {
                    switch (uri.getHost() == null ? "" : uri.getHost()) {
                        case "settings":
                            runOnUiThread(() -> showFilterDialog());
                            break;
                        case "keyboard":
                            webView.postDelayed(() -> {
                                InputMethodManager ime = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                                if (ime != null) ime.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
                            }, 90);
                            break;
                        case "tap":
                            try {
                                float x = Float.parseFloat(uri.getQueryParameter("x"));
                                float y = Float.parseFloat(uri.getQueryParameter("y"));
                                if (Float.isFinite(x) && Float.isFinite(y)
                                        && x > 0 && y > 0 && x < 1 && y < 1) {
                                    webView.post(() -> touchWebView(x, y));
                                }
                            } catch (RuntimeException ignored) { }
                            break;
                        default: break;
                    }
                    return true;
                }
                if ("https".equals(uri.getScheme()) && "ultra-tv-ai.pages.dev".equals(uri.getHost())) return false;
                if ("https".equals(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) {
                        // Stay in app if there is no external browser on the TV.
                    }
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = view;
                fullscreenCallback = callback;
                container.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
                if (pointerOverlay != null) pointerOverlay.bringToFront();
                hideSystemBars();
            }
            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });
        container.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        pointerOverlay = new TvPointerOverlay(this);
        pointerOverlay.setVisibility(View.GONE);
        container.addView(pointerOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        Toast.makeText(this,
                "Настройки: удерживайте «Назад». Указатель: удерживайте OK.",
                Toast.LENGTH_LONG).show();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(HOME);
        }
        webView.requestFocus();
    }

    private void showFilterDialog() {
        boolean on = adBlockFilter.isEnabled();
        String status = on ? "включён" : "выключен";
        String last = adBlockFilter.getLastBlockedHost();
        String message = "Удерживайте кнопку «Назад» 2 секунды, чтобы снова открыть настройки.\n\nФильтр " + status
                + ". За этот запуск заблокировано запросов: " + adBlockFilter.getBlockedCount()
                + ". Список: " + adBlockFilter.getDomainCount() + " рекламных доменов.\n\n"
                + (last.isEmpty() ? "" : "Последний заблокированный домен: " + last + "\n\n")
                + "Это экспериментальная фильтрация. Она может не убрать рекламу в Initem "
                + "и иногда нарушать загрузку плеера. Выключение фильтра восстанавливает доступ к запросам. "
                + "Изменение режима перезагрузит страницу и прервёт текущее видео.";
        new AlertDialog.Builder(this)
                .setTitle("Ultra TV · Фильтр рекламы")
                .setMessage(message)
                .setPositiveButton(on ? "Выключить фильтр" : "Включить фильтр", (dialog, which) -> {
                    adBlockFilter.setEnabled(!on);
                    if (webView != null) webView.reload();
                })
                .setNeutralButton("Обновить страницу", (dialog, which) -> {
                    if (webView != null) webView.reload();
                })
                .setNegativeButton("Закрыть", null)
                .show();
    }

    /**
     * Hardware remote shortcut: hold Back for 1.5 seconds to open native settings.
     * This runs BEFORE dispatching to WebView and works even if D-pad focus is trapped
     * inside the site, iframe or fullscreen player.
     * Short Back preserves the normal player-close/navigation behavior.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        final int key = event.getKeyCode();
        if (pointerMode) {
            if (key == KeyEvent.KEYCODE_BACK) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0)
                    hideNativePointer(true);
                return true;
            }
            if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN
                    || key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && pointerOverlay != null) {
                    float step = event.getRepeatCount() > 2 ? .075f : .045f;
                    float x = pointerOverlay.getRelativeX(), y = pointerOverlay.getRelativeY();
                    if (key == KeyEvent.KEYCODE_DPAD_LEFT) x -= step;
                    if (key == KeyEvent.KEYCODE_DPAD_RIGHT) x += step;
                    if (key == KeyEvent.KEYCODE_DPAD_UP) y -= step;
                    if (key == KeyEvent.KEYCODE_DPAD_DOWN) y += step;
                    pointerOverlay.position(x, y);
                }
                return true;
            }
            if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
                if (event.getAction() == KeyEvent.ACTION_UP) tapNativePointer();
                return true;
            }
        }
        // Fallback: hold OK for 900ms to enter native cursor mode, even
        // if the iframe has trapped keyboard focus. Normal short OK is
        // forwarded to WebView/HTML5 fullscreen.
        if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (event.getRepeatCount() == 0) {
                    okHeld = true;
                    longOkTriggered = false;
                    remoteHandler.removeCallbacks(activatePointerOnLongOk);
                    remoteHandler.postDelayed(activatePointerOnLongOk, 900L);
                }
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_UP) {
                remoteHandler.removeCallbacks(activatePointerOnLongOk);
                boolean normalClick = okHeld && !longOkTriggered && !event.isCanceled();
                okHeld = false;
                longOkTriggered = false;
                if (normalClick) forwardOk(key);
                return true;
            }
        }
        if (key == KeyEvent.KEYCODE_MENU || key == KeyEvent.KEYCODE_SETTINGS) {
            if (event.getAction() == KeyEvent.ACTION_UP) showFilterDialog();
            return true;
        }
        if (key == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (event.getRepeatCount() == 0) {
                    backHeld = true;
                    longBackOpenedSettings = false;
                    remoteHandler.removeCallbacks(openSettingsOnLongBack);
                    remoteHandler.postDelayed(openSettingsOnLongBack, 1500L);
                }
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_UP) {
                remoteHandler.removeCallbacks(openSettingsOnLongBack);
                boolean normalBack = backHeld && !longBackOpenedSettings && !event.isCanceled();
                backHeld = false;
                longBackOpenedSettings = false;
                if (normalBack) onBackPressed();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    /** Native cursor remains visible above WebView and fullscreen custom views. */
    private void showNativePointer(float x, float y) {
        if (pointerOverlay == null) return;
        pointerMode = true;
        if (!Float.isFinite(x) || !Float.isFinite(y)) { x = .5f; y = .5f; }
        pointerOverlay.position(x, y);
        pointerOverlay.setVisibility(View.VISIBLE);
        pointerOverlay.bringToFront();
    }

    private void hideNativePointer(boolean notifyWeb) {
        if (!pointerMode) return;
        pointerMode = false;
        if (pointerOverlay != null) pointerOverlay.setVisibility(View.GONE);
        if (notifyWeb && webView != null) {
            webView.evaluateJavascript(
                "if(window.UltraTVRemote&&window.UltraTVRemote.releaseCursor)" +
                "window.UltraTVRemote.releaseCursor(true);", null);
        }
    }

    private void forwardOk(int key) {
        View target = fullscreenView != null ? fullscreenView : webView;
        if (target == null) return;
        long t = SystemClock.uptimeMillis();
        target.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, key, 0));
        target.dispatchKeyEvent(new KeyEvent(t, t + 22L, KeyEvent.ACTION_UP, key, 0));
    }

    private void tapNativePointer() {
        if (pointerOverlay == null) return;
        pointerOverlay.clicked();
        touchWebView(pointerOverlay.getRelativeX(), pointerOverlay.getRelativeY());
    }

    /** Inject a real touch for third-party iframe controls; synthetic JS events
     * cannot cross the iframe's origin boundary. Touches stay inside WebView. */
    private void touchWebView(float normalizedX, float normalizedY) {
        View target = fullscreenView != null ? fullscreenView : webView;
        if (target == null || target.getWidth() <= 0 || target.getHeight() <= 0) return;
        final float x = normalizedX * target.getWidth();
        final float y = normalizedY * target.getHeight();
        final long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        target.dispatchTouchEvent(down);
        down.recycle();
        MotionEvent up = MotionEvent.obtain(now, now + 65L, MotionEvent.ACTION_UP, x, y, 0);
        target.dispatchTouchEvent(up);
        up.recycle();
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        container.removeView(fullscreenView);
        fullscreenView = null;
        webView.setVisibility(View.VISIBLE);
        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
        hideNativePointer(true);
        hideSystemBars();
        webView.requestFocus();
    }

    @Override
    public void onBackPressed() {
        if (pointerMode) {
            hideNativePointer(true);
            return;
        }
        if (fullscreenView != null) {
            exitFullscreen();
            return;
        }
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        // For the site's native modal, Back should close the player first.
        // Cross-origin iframe internals are deliberately not accessed.
        webView.evaluateJavascript(
            "(function(){if(window.UltraTVRemote&&window.UltraTVRemote.back){" +
            "return !!window.UltraTVRemote.back();}" +
            "var x=document.querySelector('#player-root');" +
            "if(x&&x.children.length&&window.UltraTVPlayer){" +
            "window.UltraTVPlayer.close();return true;}return false;})()",
            result -> {
                if ("true".equals(result)) return;
                if (webView != null && webView.canGoBack()) webView.goBack();
                else UltraTvActivity.super.onBackPressed();
            });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        if (webView != null) webView.saveState(out);
        super.onSaveInstanceState(out);
    }

    @Override
    protected void onDestroy() {
        remoteHandler.removeCallbacks(openSettingsOnLongBack);
        remoteHandler.removeCallbacks(activatePointerOnLongOk);
        if (webView != null) {
            container.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
