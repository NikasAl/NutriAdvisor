package ru.kreagenium.nuadvi;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

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
 * exercises, plus a raw accelerometer stream for the JS fallback algorithm.
 *
 * Two modes, decided by start():
 *
 *  1. "pedometer" — hardware step counter (Sensor.TYPE_STEP_COUNTER, the
 *     same stream the Progulkin pedometer package wraps). Delivers session
 *     steps through the "onStepsChanged" event. The sensor reports the
 *     CUMULATIVE step count since the last reboot, so the plugin baselines
 *     it on the first event of every start() call and reports
 *     value - baseline. JS accumulates segments across pause/resume
 *     (pause = stop(), resume = start() with a fresh baseline), mirroring
 *     Progulkin's PedometerService resume logic.
 *     Requires the ACTIVITY_RECOGNITION runtime permission on API 29+;
 *     on older APIs it is granted implicitly.
 *
 *  2. "accelerometer" — raw TYPE_ACCELEROMETER samples ("onAccel" events,
 *     x/y/z in m/s² including gravity, ~50 Hz via SENSOR_DELAY_GAME).
 *     The step-detection algorithm (smoothing, peak picking, adaptive
 *     threshold, 0.4–1.8 s step interval) runs in JS (src/lib/pedometer.ts,
 *     ported from Progulkin's PedometerService) so the browser PWA and the
 *     APK share one implementation. We stream raw samples natively because
 *     the Android WebView does not reliably dispatch devicemotion events
 *     (chromium bug 178252), while SensorManager always works.
 *     No permission is required for the accelerometer.
 *
 * The @capacitor/motion npm package (v8) ships web-only code (DeviceMotion),
 * so all native sensor access lives here, by design. Card/mapping parts of
 * Progulkin are intentionally NOT ported (duplication is a deliberate
 * decision by Nikas — the apps have different purposes).
 *
 * Threading: sensor events arrive on a dedicated HandlerThread to keep the
 * main thread free; notifyListeners() is safe to call from there.
 */
@CapacitorPlugin(
    name = "NativePedometer",
    permissions = {
        @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = NativePedometerPlugin.ACTIVITY_ALIAS)
    }
)
public class NativePedometerPlugin extends Plugin {

    /** Alias must be public: class-level @Permission annotations cannot see private constants. */
    public static final String ACTIVITY_ALIAS = "activity";

    private static final String TAG = "NativePedometer";

    private SensorManager sensorManager;
    private HandlerThread sensorThread;
    private Handler sensorHandler;

    private SensorEventListener stepListener;
    private SensorEventListener accelListener;
    /** First TYPE_STEP_COUNTER value seen in the current start() session. */
    private float stepBaseline = -1f;

    private synchronized SensorManager getSensorManager() {
        if (sensorManager == null) {
            sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        return sensorManager;
    }

    private synchronized void ensureSensorThread() {
        if (sensorThread == null) {
            sensorThread = new HandlerThread("NativePedometerSensors");
            sensorThread.start();
            sensorHandler = new Handler(sensorThread.getLooper());
        }
    }

    private synchronized void teardownSensorThread() {
        if (sensorThread != null) {
            sensorThread.quitSafely();
            sensorThread = null;
            sensorHandler = null;
        }
    }

    /**
     * Start counting. Resolves with { source, supported }:
     *   - { source: "pedometer", supported: true }        → hardware step counter streaming
     *   - { source: "none", needsPermission: true }       → ask requestPermission() first, then call start() again
     *   - { source: "accelerometer", supported: true }    → raw accel stream (JS runs the algorithm)
     *   - { source: "unavailable", supported: false }     → neither sensor exists on this device
     */
    @PluginMethod
    public void start(PluginCall call) {
        SensorManager sm = getSensorManager();
        if (sm == null) {
            JSObject result = new JSObject();
            result.put("source", "unavailable");
            result.put("supported", false);
            call.resolve(result);
            return;
        }

        Sensor stepSensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);

        if (stepSensor != null) {
            if (Build.VERSION.SDK_INT >= 29) {
                PermissionState state = getPermissionState(ACTIVITY_ALIAS);
                if (state == PermissionState.DENIED) {
                    // User refused the permission — go straight to the accelerometer fallback.
                    startAccelerometer(call);
                    return;
                }
                if (state != PermissionState.GRANTED) {
                    // "prompt" (or prompt-with-rationale): let JS decide when to show the dialog.
                    JSObject result = new JSObject();
                    result.put("source", "none");
                    result.put("needsPermission", true);
                    result.put("supported", true);
                    call.resolve(result);
                    return;
                }
            }
            startStepCounter(stepSensor);
            JSObject result = new JSObject();
            result.put("source", "pedometer");
            result.put("supported", true);
            call.resolve(result);
            return;
        }

        startAccelerometer(call);
    }

    private void startStepCounter(Sensor stepSensor) {
        stopListeners();
        stepBaseline = -1f;
        ensureSensorThread();

        stepListener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;
                float cumulative = event.values[0];
                if (stepBaseline < 0f) {
                    stepBaseline = cumulative; // fresh baseline per start() session
                }
                int sessionSteps = Math.max(0, Math.round(cumulative - stepBaseline));
                JSObject data = new JSObject();
                data.put("steps", sessionSteps);
                notifyListeners("onStepsChanged", data);
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {
                // not used
            }
        };
        smRegister(stepSensor, stepListener, SensorManager.SENSOR_DELAY_UI);
        Log.d(TAG, "step-counter mode started");
    }

    private void startAccelerometer(PluginCall call) {
        SensorManager sm = getSensorManager();
        Sensor accelSensor = sm != null ? sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) : null;
        if (accelSensor == null) {
            stopListeners();
            JSObject result = new JSObject();
            result.put("source", "unavailable");
            result.put("supported", false);
            call.resolve(result);
            return;
        }
        stopListeners();
        ensureSensorThread();

        accelListener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;
                JSObject data = new JSObject();
                data.put("x", event.values[0]);
                data.put("y", event.values[1]);
                data.put("z", event.values[2]);
                notifyListeners("onAccel", data);
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {
                // not used
            }
        };
        smRegister(accelSensor, accelListener, SensorManager.SENSOR_DELAY_GAME);
        JSObject result = new JSObject();
        result.put("source", "accelerometer");
        result.put("supported", true);
        call.resolve(result);
        Log.d(TAG, "accelerometer mode started (~50 Hz)");
    }

    private synchronized void smRegister(Sensor sensor, SensorEventListener listener, int rate) {
        try {
            getSensorManager().registerListener(listener, sensor, rate, sensorHandler);
        } catch (Exception e) {
            Log.w(TAG, "registerListener failed", e);
        }
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

    @PermissionCallback
    private void activityPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(ACTIVITY_ALIAS) == PermissionState.GRANTED);
        call.resolve(result);
    }

    /** Stop all sensor streaming. Safe to call repeatedly. */
    @PluginMethod
    public void stop(PluginCall call) {
        stopListeners();
        teardownSensorThread();
        call.resolve();
    }

    private synchronized void stopListeners() {
        SensorManager sm = getSensorManager();
        if (sm != null) {
            if (stepListener != null) {
                try { sm.unregisterListener(stepListener); } catch (Exception ignored) {}
                stepListener = null;
            }
            if (accelListener != null) {
                try { sm.unregisterListener(accelListener); } catch (Exception ignored) {}
                accelListener = null;
            }
        }
        stepBaseline = -1f;
    }

    @Override
    protected void handleOnDestroy() {
        stopListeners();
        teardownSensorThread();
        super.handleOnDestroy();
    }
}
