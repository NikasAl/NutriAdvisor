package com.nutriadvisor.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void init(Bundle savedInstanceState) {
        super.init(savedInstanceState);
        // Set mixed content AFTER bridge+WebView are fully created.
        // super.init() calls Bridge Builder which creates CapacitorWebView,
        // so getBridge().getWebView() is valid here.
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setAllowFileAccess(true);
            settings.setBlockNetworkLoads(false);
        }
    }
}
