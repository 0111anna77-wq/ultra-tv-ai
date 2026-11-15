package ai.ultra.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Private Android TV client for the same Ultra TV website.
 * The video iframe is still a separate website: this shell does NOT bypass
 * its restrictions or expose the internal video clock.
 */
public final class UltraTvActivity extends Activity {
    private static final String HOME = "https://ultra-tv-ai.pages.dev/";
    private FrameLayout container;
    private WebView webView;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        container = new FrameLayout(this);
        setContentView(container);
        hideSystemBars();

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
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
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
                hideSystemBars();
            }
            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });
        container.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(HOME);
        }
        webView.requestFocus();
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
        hideSystemBars();
        webView.requestFocus();
    }

    @Override
    public void onBackPressed() {
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
            "(function(){var x=document.querySelector('#player-root');" +
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
        if (webView != null) {
            container.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
