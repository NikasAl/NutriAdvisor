package ru.kreagenium.nuadvi;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.util.Log;

import androidx.core.content.ContextCompat;

/**
 * Sensor layer of the workout pedometer, shared by two execution contexts:
 *
 *  - PedometerService (foreground service, screen-off capable) — the normal
 *    path for background counting;
 *  - NativePedometerPlugin (in-process HandlerThread) — fallback used when
 *    the foreground service cannot start (e.g. restrictive FGS policy).
 *
 * Two modes, decided by the caller (plugin start()) and re-validated here:
 *
 *  1. "pedometer" — hardware step counter (Sensor.TYPE_STEP_COUNTER, the
 *     same stream the Progulkin pedometer package wraps). The sensor
 *     reports the CUMULATIVE step count since the last reboot, so the
 *     engine baselines it on the first event of every start() and reports
 *     value - baseline. Because every event carries an absolute value,
 *     events lost to WebView freezing / sensor-FIFO overruns are harmless:
 *     the next delivered event still yields the correct session count
 *     (baseline accumulation, NOT per-event increments).
 *     Requires ACTIVITY_RECOGNITION on API 29+.
 *
 *  2. "accelerometer" — TYPE_ACCELEROMETER at ~50 Hz fed into StepDetector
 *     (the Java port of Progulkin's algorithm). Runs natively so counting
 *     survives the screen-off WebView freeze too. No permission required.
 *
 * All callbacks arrive on the Handler provided by the owner.
 */
final class PedometerEngine {

    /** Session-relative step count changed (called on the sensor thread). */
    interface Listener {
        void onSessionSteps(int sessionSteps);
    }

    static final String MODE_PEDOMETER = "pedometer";
    static final String MODE_ACCELEROMETER = "accelerometer";
    static final String MODE_UNAVAILABLE = "unavailable";

    private static final String TAG = "PedometerEngine";

    private final Context context;
    private final Listener listener;
    private final SensorManager sensorManager;
    private final Handler handler;

    private final StepDetector detector = new StepDetector();

    private SensorEventListener stepListener;
    private SensorEventListener accelListener;
    private String mode = MODE_UNAVAILABLE;
    private int sessionSteps = 0;
    /** First TYPE_STEP_COUNTER value seen in the current start() session. */
    private float stepBaseline = -1f;

    PedometerEngine(Context context, Listener listener, Handler handler) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        this.handler = handler;
        this.sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
    }

    /**
     * Start streaming in the requested mode. Returns the mode actually
     * engaged: the requested one, or the accelerometer fallback when the
     * step counter / its permission turned out to be unavailable, or
     * MODE_UNAVAILABLE when the device has no usable sensor at all.
     */
    synchronized String start(String requestedMode) {
        stop();
        sessionSteps = 0;
        stepBaseline = -1f;
        detector.reset();

        if (sensorManager == null) {
            mode = MODE_UNAVAILABLE;
            return mode;
        }

        boolean permOk = Build.VERSION.SDK_INT < 29
                || ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION)
                        == PackageManager.PERMISSION_GRANTED;

        if (MODE_PEDOMETER.equals(requestedMode) && permOk) {
            Sensor stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
            if (stepSensor != null) {
                stepListener = new SensorEventListener() {
                    @Override
                    public void onSensorChanged(SensorEvent event) {
                        if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;
                        float cumulative = event.values[0];
                        if (stepBaseline < 0f) {
                            stepBaseline = cumulative; // fresh baseline per start() session
                        }
                        int steps = Math.max(0, Math.round(cumulative - stepBaseline));
                        if (steps != sessionSteps) {
                            sessionSteps = steps;
                            listener.onSessionSteps(steps);
                        }
                    }

                    @Override
                    public void onAccuracyChanged(Sensor sensor, int accuracy) {
                        // not used
                    }
                };
                register(stepSensor, stepListener, SensorManager.SENSOR_DELAY_UI);
                mode = MODE_PEDOMETER;
                Log.d(TAG, "pedometer mode started");
                return mode;
            }
        }

        Sensor accelSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelSensor == null) {
            mode = MODE_UNAVAILABLE;
            return mode;
        }
        accelListener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;
                // Sensor timestamps are ns since boot (monotonic) on API 24+.
                double timeSec = event.timestamp / 1_000_000_000.0;
                if (detector.processSample(event.values[0], event.values[1], event.values[2], timeSec)) {
                    sessionSteps++;
                    listener.onSessionSteps(sessionSteps);
                }
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {
                // not used
            }
        };
        register(accelSensor, accelListener, SensorManager.SENSOR_DELAY_GAME); // ~50 Hz
        mode = MODE_ACCELEROMETER;
        Log.d(TAG, "accelerometer mode started (native peak detection)");
        return mode;
    }

    /** Stop all sensor streaming and reset the session. Safe to call repeatedly. */
    synchronized void stop() {
        if (sensorManager != null) {
            if (stepListener != null) {
                try { sensorManager.unregisterListener(stepListener); } catch (Exception ignored) {}
                stepListener = null;
            }
            if (accelListener != null) {
                try { sensorManager.unregisterListener(accelListener); } catch (Exception ignored) {}
                accelListener = null;
            }
        }
        stepBaseline = -1f;
        sessionSteps = 0;
        detector.reset();
        mode = MODE_UNAVAILABLE;
    }

    /** Steps accumulated in the current start() session (authoritative, baseline-based). */
    synchronized int getSessionSteps() {
        return sessionSteps;
    }

    synchronized String getMode() {
        return mode;
    }

    private void register(Sensor sensor, SensorEventListener listener, int rate) {
        try {
            sensorManager.registerListener(listener, sensor, rate, handler);
        } catch (Exception e) {
            Log.w(TAG, "registerListener failed", e);
        }
    }
}
