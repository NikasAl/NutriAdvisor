package ru.kreagenium.nuadvi;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // 3-button nav bars are typically 48dp+; gesture indicator is ~20dp or 0.
    // Only add bottom padding for actual button bars, not gesture indicators.
    private static final int NAV_BAR_THRESHOLD_PX = 48;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeHttpPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, windowInsets) -> {
            int bottom = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;

            WebView webView = getBridge().getWebView();
            if (webView != null) {
                // Only inject bottom padding for 3-button navigation bars,
                // not for gesture navigation indicators.
                if (bottom > NAV_BAR_THRESHOLD_PX) {
                    String js = "document.documentElement.style.setProperty('--safe-bottom','" + bottom + "px')";
                    webView.evaluateJavascript(js, null);
                } else {
                    // Clear any previously set value (e.g. rotation changed)
                    String js = "document.documentElement.style.setProperty('--safe-bottom','0px')";
                    webView.evaluateJavascript(js, null);
                }
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
