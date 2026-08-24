package ru.kreagenium.nuadvi;

import android.os.Bundle;
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

        // Listen for inset changes and inject safe areas into WebView
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, windowInsets) -> {
            int top = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            int bottom = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;

            WebView webView = getBridge().getWebView();
            if (webView != null) {
                String js = "document.documentElement.style.setProperty('--safe-top','" + top + "px');"
                        + "document.documentElement.style.setProperty('--safe-bottom','" + bottom + "px');";
                webView.evaluateJavascript(js, null);
            }

            return windowInsets;
        });
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
