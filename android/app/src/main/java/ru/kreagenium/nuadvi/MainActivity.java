package ru.kreagenium.nuadvi;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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
        // Pedometer bridge: background step counting for walk/run workout
        // exercises (hardware TYPE_STEP_COUNTER) plus a raw accelerometer
        // stream for the JS fallback algorithm. See NativePedometerPlugin docs.
        registerPlugin(NativePedometerPlugin.class);
        super.onCreate(savedInstanceState);

        // Edge-to-edge only works reliably on API 30+ (Android 11+).
        // On older devices the WebView does not handle insets correctly,
        // so we keep the default DecorFitsSystemWindows=true behaviour
        // and let the OS lay out content below the system bars.
        if (Build.VERSION.SDK_INT >= 30) {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        }
        // After the edge-to-edge switch, pin the system bar icon foreground
        // to the SYSTEM theme (last write wins at startup). Without this the
        // icons stay in the platform default state (light icons), which
        // renders an unreadable white clock/battery over the light
        // windowBackground. Same policy as android:windowLightStatusBar in
        // values/ + values-night/ styles and as Capacitor 8's built-in
        // SystemBars plugin, so every writer agrees.
        applySystemBarAppearance();
    }

    // Foreground color of the status/navigation bar icons follows the
    // SYSTEM light/dark theme — never the in-app (CSS) theme: dark icons on
    // the light windowBackground, light icons on the dark one. The panel
    // color itself is never forced: the bars stay transparent and show the
    // DayNight windowBackground behind them.
    private void applySystemBarAppearance() {
        int nightMode = getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK;
        boolean lightSystemTheme = nightMode != Configuration.UI_MODE_NIGHT_YES;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(lightSystemTheme);
        controller.setAppearanceLightNavigationBars(lightSystemTheme);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The system theme can flip while the app is open (configChanges in
        // the manifest includes uiMode, so the activity is NOT recreated):
        // re-apply the icon appearance so the panel never goes unreadable.
        applySystemBarAppearance();
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
