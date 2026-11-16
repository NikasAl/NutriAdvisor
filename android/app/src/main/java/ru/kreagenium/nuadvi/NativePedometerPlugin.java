package ru.kreagenium.nuadvi;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Local Capacitor plugin: background step counting for walk/run workout
 * exercises, built to survive the SCREEN-OFF / frozen-WebView case.
 *
 * When the user walks or runs with the phone in the pocket, the activity is
 * stopped and the WebView renderer freezes: JS timers, rAF and even plugin
 * event delivery into JS are throttled or lost. Counting therefore lives
 * on the native side:
 *
 *  - PedometerService (foreground service, «Тренировка: N шагов»
 *    notification, PARTIAL_WAKE_LOCK) owns the sensors while a workout
 *    segment runs. An FGS process is never frozen by the Cached App
 *    Freezer and keeps its sensor callbacks; step accumulation is
 *    BASELINE-based (cumulative counter value - session baseline), so
 *    events "lost" while JS was frozen do not matter.
 *  - If the foreground service cannot start (FGS policy restrictions),
 *    the plugin falls back to an in-process PedometerEngine on its own
 *    HandlerThread — same counting, but only reliable while the app is
 *    in the foreground (screen on).
 *  - Both paths report SESSION steps through the "onStepsChanged" event
 *    and expose the authoritative value via getSteps(); JS re-syncs on
 *    every visibility resume (freeze/thaw, tab switch, app restart) and
 *    rebuilds its segment from that value.
 *
 * Two sensor modes, decided by start():
 *
 *  1. "pedometer" — hardware TYPE_STEP_COUNTER (the stream the Progulkin
 *     pedometer package wraps). Requires ACTIVITY_RECOGNITION on API 29+;
 *     on older APIs granted implicitly.
 *  2. "accelerometer" — TYPE_ACCELEROMETER ~50 Hz fed into StepDetector
 *     (the Java port of Progulkin's algorithm: smoothing, peak maxima,
 *     adaptive threshold, 0.4–1.8 s step interval). It runs natively (not
 *     in JS) precisely so the fallback also counts with the screen off.
 *     No permission required.
 *
 * In browsers (PWA) this plugin is absent and the pedometer service falls
 * back to DeviceMotion (@capacitor/motion) or reports the feature as
 * unavailable; true background counting is impossible in a browser and the
 * UI says so honestly.
 *
 * The @capacitor/motion npm package (v8) ships web-only code (DeviceMotion),
 * so all native sensor access lives here, by design. Card/mapping parts of
 * Progulkin are intentionally NOT ported (duplication is a deliberate
 * decision by Nikas — the apps have different purposes).
 */
@CapacitorPlugin(
    name = "NativePedometer",
    permissions = {
        @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = NativePedometerPlugin.ACTIVITY_ALIAS),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = NativePedometerPlugin.NOTIFICATIONS_ALIAS)
    }
)
public class NativePedometerPlugin extends Plugin {

    /** Aliases must be public: class-level @Permission annotations cannot see private constants. */
    public static final String ACTIVITY_ALIAS = "activity";
    public static final String NOTIFICATIONS_ALIAS = "notifications";

    private static final String TAG = "NativePedometer";

    /** Set in load(); used by PedometerService to push steps into JS (null-safe). */
    private static volatile NativePedometerPlugin sInstance;

    private SensorManager sensorManager;
    private HandlerThread sensorThread;
    private Handler sensorHandler;

    /** In-process fallback engine (used only when the FGS cannot start). */
    private PedometerEngine inProcessEngine;

    /** Authoritative last known session state (service or in-process engine). */
    private volatile int lastSessionSteps = 0;
    private volatile boolean lastRunning = false;

    @Override
    public void load() {
        super.load();
        sInstance = this;
    }

    private synchronized SensorManager getSensorManager() {
        if (sensorManager == null) {
            sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        return sensorManager;
    }

    /**
     * Start counting. Resolves with { source, supported }:
     *   - { source: "pedometer", supported: true }        → hardware step counter streaming
     *   - { source: "accelerometer", supported: true }    → native accelerometer peak detection
     *   - { source: "none", needsPermission: true }       → ask requestPermission() first, then call start() again
     *   - { source: "unavailable", supported: false }     → neither sensor exists on this device
     *
     * Options (all optional): setId (workout set id, for cross-segment
     * continuity of the notification), initialSteps (steps JS already
     * accumulated for the set), stepLengthM (profile setting, for the
     * notification distance).
     */
    @PluginMethod
    public void start(PluginCall call) {
        SensorManager sm = getSensorManager();
        if (sm == null) {
            lastRunning = false;
            JSObject result = new JSObject();
            result.put("source", "unavailable");
            result.put("supported", false);
            call.resolve(result);
            return;
        }

        Sensor stepSensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        String mode;
        if (stepSensor != null) {
            if (Build.VERSION.SDK_INT >= 29) {
                PermissionState state = getPermissionState(ACTIVITY_ALIAS);
                if (state == PermissionState.DENIED) {
                    // User refused the permission — go straight to the accelerometer fallback.
                    mode = PedometerEngine.MODE_ACCELEROMETER;
                } else if (state != PermissionState.GRANTED) {
                    // "prompt" (or prompt-with-rationale): let JS decide when to show the dialog.
                    lastRunning = false;
                    JSObject result = new JSObject();
                    result.put("source", "none");
                    result.put("needsPermission", true);
                    result.put("supported", true);
                    call.resolve(result);
                    return;
                } else {
                    mode = PedometerEngine.MODE_PEDOMETER;
                }
            } else {
                mode = PedometerEngine.MODE_PEDOMETER;
            }
        } else {
            mode = PedometerEngine.MODE_ACCELEROMETER;
        }

        if (PedometerEngine.MODE_ACCELEROMETER.equals(mode)
                && sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) == null) {
            lastRunning = false;
            JSObject result = new JSObject();
            result.put("source", "unavailable");
            result.put("supported", false);
            call.resolve(result);
            return;
        }

        boolean background = startBackgroundService(call, mode);
        if (!background) {
            startInProcess(mode);
        }
        lastRunning = true;
        JSObject result = new JSObject();
        result.put("source", mode);
        result.put("supported", true);
        call.resolve(result);
    }

    /** Start PedometerService (foreground, screen-off capable). Returns false when FGS is not possible. */
    private boolean startBackgroundService(PluginCall call, String mode) {
        String setId = call.getString("setId", "");
        Integer initial = call.getInt("initialSteps", 0);
        Float stepLen = call.getFloat("stepLengthM", 0.75f);
        Boolean fresh = call.getBoolean("fresh", false);
        try {
            Intent intent = new Intent(getContext(), PedometerService.class)
                    .setAction(PedometerService.ACTION_START_RUN)
                    .putExtra(PedometerService.EXTRA_MODE, mode)
                    .putExtra(PedometerService.EXTRA_SET_ID, setId != null ? setId : "")
                    .putExtra(PedometerService.EXTRA_INITIAL_STEPS, initial != null ? initial : 0)
                    .putExtra(PedometerService.EXTRA_STEP_LENGTH_M,
                            stepLen != null && stepLen > 0f ? stepLen : 0.75f)
                    .putExtra(PedometerService.EXTRA_FRESH, fresh != null && fresh);
            ContextCompat.startForegroundService(getContext(), intent);
            Log.d(TAG, "pedometer foreground service started (mode=" + mode + ")");
            return true;
        } catch (Exception e) {
            // FGS restrictions (or any platform quirk): keep counting in-process.
            Log.w(TAG, "foreground service start failed, falling back to in-process engine", e);
            return false;
        }
    }

    /** Fallback path: run the engine on a plugin-owned HandlerThread (no screen-off guarantee). */
    private synchronized void startInProcess(String mode) {
        stopInProcess();
        if (sensorThread == null) {
            sensorThread = new HandlerThread("NativePedometerSensors");
            sensorThread.start();
            sensorHandler = new Handler(sensorThread.getLooper());
        }
        inProcessEngine = new PedometerEngine(getContext(), (sessionSteps) -> {
            lastSessionSteps = sessionSteps;
            dispatchSteps(sessionSteps, true);
        }, sensorHandler);
        String actual = inProcessEngine.start(mode);
        Log.d(TAG, "in-process engine started (mode=" + actual + ")");
    }

    private synchronized void stopInProcess() {
        if (inProcessEngine != null) {
            inProcessEngine.stop();
            inProcessEngine = null;
        }
    }

    /**
     * Authoritative session step count — the freeze/thaw recovery path.
     * JS calls this on every visibility resume and rebuilds its segment
     * from the returned value, because events delivered into a frozen
     * WebView may have been lost. { steps: number, running: boolean }.
     */
    @PluginMethod
    public void getSteps(PluginCall call) {
        JSObject result = new JSObject();
        result.put("steps", lastSessionSteps);
        result.put("running", lastRunning);
        call.resolve(result);
    }

    /** Request ACTIVITY_RECOGNITION (no-op granted on API < 29). Resolves { granted }. */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < 29) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        PermissionState state = getPermissionState(ACTIVITY_ALIAS);
        if (state == PermissionState.GRANTED) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (state == PermissionState.DENIED) {
            // Do not nag: the user already refused. JS falls back to accelerometer.
            result.put("granted", false);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias(ACTIVITY_ALIAS, call, "activityPermissionCallback");
    }

    /**
     * Best-effort POST_NOTIFICATIONS request (Android 13+): without it the
     * foreground service still runs, but its «Тренировка: N шагов»
     * notification stays hidden. Resolves { granted }; never blocks the
     * counting flow.
     */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < 33 /* TIRAMISU */) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        PermissionState state = getPermissionState(NOTIFICATIONS_ALIAS);
        if (state == PermissionState.GRANTED) {
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (state == PermissionState.DENIED) {
            result.put("granted", false);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias(NOTIFICATIONS_ALIAS, call, "notificationsPermissionCallback");
    }

    @PermissionCallback
    private void activityPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(ACTIVITY_ALIAS) == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(NOTIFICATIONS_ALIAS) == PermissionState.GRANTED);
        call.resolve(result);
    }

    /**
     * Stop counting: pause the service (it flushes its session into the
     * persisted total, releases the wake lock and removes the notification)
     * and stop the in-process fallback if it was used. JS calls getSteps()
     * BEFORE stop() to capture the authoritative count.
     */
    @PluginMethod
    public void stop(PluginCall call) {
        lastRunning = false;
        try {
            // The app is in the foreground whenever JS runs this (pause/stop
            // are user actions), so plain startService() is allowed and the
            // service stops itself without showing a new notification.
            Intent intent = new Intent(getContext(), PedometerService.class)
                    .setAction(PedometerService.ACTION_STOP);
            getContext().startService(intent);
        } catch (Exception e) {
            Log.w(TAG, "stop intent not delivered (service may be gone already)", e);
        }
        stopInProcess();
        if (sensorThread != null) {
            sensorThread.quitSafely();
            sensorThread = null;
            sensorHandler = null;
        }
        call.resolve();
    }

    /** Push a step update into JS; called from PedometerService and the in-process engine. */
    static void dispatchSteps(int sessionSteps, boolean running) {
        NativePedometerPlugin plugin = sInstance;
        if (plugin == null) return; // WebView/bridge gone — the service keeps counting on its own
        plugin.lastSessionSteps = sessionSteps;
        plugin.lastRunning = running;
        JSObject data = new JSObject();
        data.put("steps", sessionSteps);
        try {
            plugin.notifyListeners("onStepsChanged", data);
        } catch (Exception ignored) {
            // never let event delivery break counting
        }
    }

    @Override
    protected void handleOnDestroy() {
        sInstance = null;
        stopInProcess();
        if (sensorThread != null) {
            sensorThread.quitSafely();
            sensorThread = null;
        }
        super.handleOnDestroy();
        // Note: PedometerService is NOT stopped here on purpose — a running
        // workout keeps counting in the background even if the activity is
        // destroyed by the system.
    }
}
