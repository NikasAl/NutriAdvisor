package ru.kreagenium.nuadvi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.util.Locale;

/**
 * Foreground service that keeps the workout pedometer alive while the
 * screen is OFF and the app is in the background (the user walks/runs with
 * the phone in the pocket):
 *
 *  - an FGS process is not frozen by the Android Cached App Freezer and is
 *    last in line for OOM kills, so native sensor callbacks keep firing
 *    while JS in the frozen WebView cannot;
 *  - the notification "Тренировка: N шагов · ≈ D" makes the requirement
 *    visible and satisfies the platform FGS contract;
 *  - a PARTIAL_WAKE_LOCK keeps the CPU awake so the accelerometer fallback
 *    (StepDetector) can process samples; it is released on pause/stop.
 *    (In deep Doze the system ignores wake locks and pauses sensors while
 *    the device is stationary — by design: no movement means no steps; as
 *    soon as the user resumes walking, Doze exits and counting continues.)
 *
 * Step accumulation is BASELINE-based and lives here, not in JS:
 * every start segment reports cumulative - baseline (hardware counter) or
 * the native StepDetector count (accelerometer), so events lost while the
 * WebView was frozen are irrelevant and the count survives freeze/thaw.
 * JS re-syncs on resume via NativePedometer.getSteps() and rebuilds its
 * segment (see src/lib/pedometer.ts).
 *
 * Lifecycle mapping (JS → service):
 *   attach/resume  → ACTION_START_RUN (extras: mode, setId, initialSteps,
 *                    stepLengthM) → startForeground + wakelock + sensors;
 *   pause/stop     → ACTION_STOP → flush session into the persisted total,
 *                    release wakelock, remove notification, stopSelf.
 * Pausing stops the service on purpose: nothing is counted during a pause
 * (Progulkin semantics — hold the accumulated count), and a foreground
 * service with an empty notification would just drain the battery.
 *
 * Process-kill recovery: state (running?, total, setId, mode, step length)
 * is mirrored into SharedPreferences on every step; START_STICKY restarts
 * the service after a kill and counting continues from the persisted
 * total with a fresh sensor baseline.
 */
public class PedometerService extends Service {

    static final String ACTION_START_RUN = "ru.kreagenium.nuadvi.pedometer.START_RUN";
    static final String ACTION_STOP = "ru.kreagenium.nuadvi.pedometer.STOP";
    static final String EXTRA_MODE = "mode";
    static final String EXTRA_SET_ID = "setId";
    static final String EXTRA_INITIAL_STEPS = "initialSteps";
    static final String EXTRA_STEP_LENGTH_M = "stepLengthM";
    static final String EXTRA_FRESH = "fresh";

    private static final String TAG = "PedometerService";
    private static final String CHANNEL_ID = "pedometer_workout";
    private static final int NOTIFICATION_ID = 41;
    private static final String PREFS = "native_pedometer";
    private static final String PREF_STATE = "state";
    private static final String STATE_RUNNING = "running";
    private static final String STATE_STOPPED = "stopped";
    private static final String PREF_SET_ID = "setId";
    private static final String PREF_MODE = "mode";
    private static final String PREF_TOTAL = "total";
    private static final String PREF_STEP_LEN = "stepLengthM";
    private static final float DEFAULT_STEP_LENGTH_M = 0.75f;
    /** Safety cap for the wake lock (6 h): a forgotten lock must never drain the battery forever. */
    private static final long WAKELOCK_TIMEOUT_MS = 6L * 60 * 60 * 1000;

    private HandlerThread sensorThread;
    private Handler sensorHandler;
    private PedometerEngine engine;
    private PowerManager.WakeLock wakeLock;

    // ── Live state, mirrored into SharedPreferences for kill/restart recovery ──
    private String setId = "";
    private long baseTotal = 0;   // steps flushed from finished segments (kill recovery)
    private float stepLengthM = DEFAULT_STEP_LENGTH_M;
    private int lastNotifiedSteps = -1;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        sensorThread = new HandlerThread("PedometerServiceSensors");
        sensorThread.start();
        sensorHandler = new Handler(sensorThread.getLooper());
        engine = new PedometerEngine(this, this::onSessionSteps, sensorHandler);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            // START_STICKY restart after the system killed the process:
            // continue the workout from the last persisted state.
            SharedPreferences p = prefs();
            if (!STATE_RUNNING.equals(p.getString(PREF_STATE, null))) {
                stopSelf();
                return START_NOT_STICKY;
            }
            setId = p.getString(PREF_SET_ID, "");
            baseTotal = p.getLong(PREF_TOTAL, 0);
            stepLengthM = p.getFloat(PREF_STEP_LEN, DEFAULT_STEP_LENGTH_M);
            String restoredMode = p.getString(PREF_MODE, PedometerEngine.MODE_PEDOMETER);
            startForegroundCompat();
            acquireWakeLock();
            String actual = engine.start(restoredMode);
            if (PedometerEngine.MODE_UNAVAILABLE.equals(actual)) {
                stopCounting();
                return START_NOT_STICKY;
            }
            lastNotifiedSteps = -1;
            updateNotification(engine.getSessionSteps());
            Log.d(TAG, "service restarted after process kill, continuing with " + baseTotal + " base steps");
            return START_STICKY;
        }

        if (ACTION_STOP.equals(intent.getAction())) {
            stopCounting();
            return START_NOT_STICKY;
        }

        // ACTION_START_RUN — attach/resume of a walk/run workout set.
        String requestedMode = intent.getStringExtra(EXTRA_MODE);
        String newSetId = intent.getStringExtra(EXTRA_SET_ID);
        if (newSetId == null) newSetId = "";
        int initialSteps = intent.getIntExtra(EXTRA_INITIAL_STEPS, 0);
        float stepLen = intent.getFloatExtra(EXTRA_STEP_LENGTH_M, DEFAULT_STEP_LENGTH_M);
        if (!Float.isFinite(stepLen) || stepLen <= 0f) stepLen = DEFAULT_STEP_LENGTH_M;

        // Cross-segment continuity: when the same workout set resumes (also
        // after pause or a process kill), keep the larger of the persisted
        // total and the count JS adopted from the draft — the notification
        // must never jump backwards. A different setId means a NEW workout,
        // and fresh=true means JS explicitly zeroed the count (timer reset):
        // both start from the steps JS reports.
        SharedPreferences p = prefs();
        boolean fresh = intent.getBooleanExtra(EXTRA_FRESH, false);
        boolean sameSet = newSetId.equals(p.getString(PREF_SET_ID, null));
        long persisted = p.getLong(PREF_TOTAL, 0);
        if (fresh) {
            baseTotal = 0;
        } else {
            baseTotal = sameSet ? Math.max(persisted, initialSteps) : initialSteps;
        }
        setId = newSetId;
        stepLengthM = stepLen;

        startForegroundCompat();
        acquireWakeLock();
        String actual = engine.start(requestedMode);
        if (PedometerEngine.MODE_UNAVAILABLE.equals(actual)) {
            // No usable sensor: stop quietly — JS already resolved the feature
            // as unavailable via the plugin start() decision.
            stopCounting();
            return START_NOT_STICKY;
        }
        persistState(0);
        lastNotifiedSteps = -1;
        updateNotification(0);
        return START_STICKY;
    }

    /** Engine callback (sensor thread): session step count changed. */
    private void onSessionSteps(int sessionSteps) {
        persistState(sessionSteps);
        NativePedometerPlugin.dispatchSteps(sessionSteps, true);
        updateNotification(sessionSteps);
    }

    private void stopCounting() {
        int sessionSteps = engine != null ? engine.getSessionSteps() : 0;
        if (engine != null) engine.stop();
        // Flush the running segment into the persisted total, then park:
        // nothing is counted while paused (Progulkin pause semantics).
        prefs().edit()
                .putString(PREF_STATE, STATE_STOPPED)
                .putString(PREF_SET_ID, setId)
                .putLong(PREF_TOTAL, baseTotal + sessionSteps)
                .putFloat(PREF_STEP_LEN, stepLengthM)
                .apply();
        NativePedometerPlugin.dispatchSteps(sessionSteps, false);
        releaseWakeLock();
        lastNotifiedSteps = -1;
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            //noinspection deprecation
            stopForeground(true);
        }
        stopSelf();
        Log.d(TAG, "counting stopped, total persisted: " + (baseTotal + sessionSteps));
    }

    @Override
    public void onDestroy() {
        if (engine != null) engine.stop();
        releaseWakeLock();
        if (sensorThread != null) {
            sensorThread.quitSafely();
            sensorThread = null;
        }
        super.onDestroy();
    }

    // ── Foreground plumbing ─────────────────────────────────────────────

    private void startForegroundCompat() {
        Notification notification = buildNotification(0);
        if (Build.VERSION.SDK_INT >= 34 /* UPSIDE_DOWN_CAKE */) {
            // FGS types are enforced on Android 14+: "health" requires
            // ACTIVITY_RECOGNITION (the normal pedometer path); the
            // accelerometer fallback (no step-counter sensor or permission
            // denied) runs as documented "specialUse" instead.
            int type = isActivityRecognitionGranted()
                    ? ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
                    : ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            startForeground(NOTIFICATION_ID, notification, type);
        } else {
            //noinspection deprecation
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private boolean isActivityRecognitionGranted() {
        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACTIVITY_RECOGNITION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Тренировки (шагомер)",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Фоновый подсчёт шагов во время тренировки");
            channel.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(int sessionSteps) {
        int total = (int) Math.min(Integer.MAX_VALUE, baseTotal + sessionSteps);
        String title = "Тренировка: " + formatSteps(total) + " " + stepsWordRu(total);
        double meters = total * stepLengthM;
        String distance = formatDistance(meters);
        String text = "≈ " + distance + " · NutriAdvisor";

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, openApp,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        return builder.build();
    }

    private void updateNotification(int sessionSteps) {
        if (sessionSteps == lastNotifiedSteps) return;
        lastNotifiedSteps = sessionSteps;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            try {
                nm.notify(NOTIFICATION_ID, buildNotification(sessionSteps));
            } catch (Exception e) {
                // A failed notification update must never break counting.
                Log.w(TAG, "notify failed", e);
            }
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nutriadvisor:pedometer");
        wakeLock.setReferenceCounted(false);
        try {
            wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
        } catch (Exception e) {
            Log.w(TAG, "wakelock acquire failed", e);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) wakeLock.release();
            } catch (Exception ignored) {}
            wakeLock = null;
        }
    }

    private void persistState(int sessionSteps) {
        prefs().edit()
                .putString(PREF_STATE, STATE_RUNNING)
                .putString(PREF_SET_ID, setId)
                .putString(PREF_MODE, engine.getMode())
                .putLong(PREF_TOTAL, baseTotal + sessionSteps)
                .putFloat(PREF_STEP_LEN, stepLengthM)
                .apply();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ── Formatting (mirrors formatDistance() / steps wording in src/lib/pedometer.ts) ──

    private static String formatSteps(int n) {
        return String.format(Locale.getDefault(), "%,d", n).replace('\u00A0', ' ');
    }

    /** Russian plural for "шаг": 1 шаг, 2–4 шага, 5+ шагов. */
    private static String stepsWordRu(int n) {
        int mod10 = n % 10;
        int mod100 = n % 100;
        if (mod10 == 1 && mod100 != 11) return "шаг";
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "шага";
        return "шагов";
    }

    /** "850 м" / "1,42 км" — same format as formatDistance() in src/lib/pedometer.ts. */
    private static String formatDistance(double meters) {
        if (meters >= 1000) {
            return String.format(Locale.US, "%.2f", meters / 1000.0).replace('.', ',') + " км";
        }
        return String.format(Locale.US, "%d", Math.round(meters)) + " м";
    }
}
