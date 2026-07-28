package com.nutriadvisor.app;

import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        // Allow mixed content for local HTTP LLM servers (llama.cpp, Ollama)
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setMixedContentMode(
                android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            );
        }
    }
}
