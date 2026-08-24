package ru.kreagenium.nuadvi;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register local plugins BEFORE super.onCreate() creates the Bridge
        registerPlugin(NativeHttpPlugin.class);
        super.onCreate(savedInstanceState);
        // Edge-to-edge: transparent system bars, content draws behind them
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        // Re-inject on every start (covers resume from background)
        injectNavBarHeight();
    }

    private void injectNavBarHeight() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        int navBarHeight = 0;

        // Use WindowInsetsCompat for accurate bar height (accounts for gesture nav)
        View decorView = getWindow().getDecorView();
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);
        if (insets != null) {
            navBarHeight = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
        }

        // Fallback: dimension resource (works on all API levels)
        if (navBarHeight == 0) {
            int resId = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
            if (resId > 0) {
                navBarHeight = getResources().getDimensionPixelSize(resId);
            }
        }

        if (navBarHeight > 0) {
            String js = "document.documentElement.style.setProperty('--safe-bottom','" + navBarHeight + "px')";
            webView.evaluateJavascript(js, null);
        }
    }
}
