package ru.kreagenium.nuadvi;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeHttpPlugin.class);
        // TTS bridge: Android System WebView does not expose the Web Speech API
        // (speechSynthesis) — chromium issue 40417848 / crbug 487187 — so AI
        // analysis read-aloud goes through the platform TextToSpeech engine.
        registerPlugin(NativeTTSPlugin.class);
        // Camera bridge: replaces @capacitor/camera's deprecated getPhoto()
        // flow, whose full-resolution BitmapFactory.decodeFile() of camera
        // shots (no inSampleSize, no OOM guard) kills the process on modern
        // 12–108 MP cameras. See NativeCameraPlugin docs.
        registerPlugin(NativeCameraPlugin.class);
        super.onCreate(savedInstanceState);

        // Edge-to-edge only works reliably on API 30+ (Android 11+).
        // On older devices the WebView does not handle insets correctly,
        // so we keep the default DecorFitsSystemWindows=true behaviour
        // and let the OS lay out content below the system bars.
        if (Build.VERSION.SDK_INT >= 30) {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        }
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
