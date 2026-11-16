package ru.kreagenium.nuadvi;

/**
 * Java port of Progulkin's step-detection algorithm
 * (github.com/NikasAl/progulkin, lib/services/pedometer_service.dart; the
 * same algorithm is mirrored in src/lib/pedometer.ts for the browser PWA):
 *
 *   1. take the max absolute axis value (NOT the magnitude);
 *   2. smooth with a 5-sample moving average;
 *   3. keep 20-sample acc/time buffers, wait for >= 10 samples;
 *   4. adaptive threshold = (bufferMax + bufferMin) / 2,
 *      skip when amplitude < 1.0 / sensitivity;
 *   5. local maximum + previous value above the threshold -> step candidate;
 *   6. accept when the interval to the previous step is 0.4-1.8 s and a
 *      series is running; a > 2.0 s gap starts a new series (first peak of
 *      a new series is not counted).
 *
 * It lives in JAVA (not TS) because the screen-off background mode runs
 * inside PedometerService, where no WebView/JS exists: the Android
 * WebView freezes JS timers when the screen is off / app is backgrounded,
 * while native SensorManager callbacks keep firing.
 *
 * Duplication with Progulkin is a deliberate decision by Nikas — the apps
 * have different purposes. Only the pedometer is ported (no maps etc.).
 */
final class StepDetector {

    /** Sensitivity 1.0 (Progulkin's default; its 0.5–2.0 range is not exposed). */
    private static final float MIN_AMPLITUDE = 1.0f;   // 1.0 / sensitivity
    private static final double MIN_STEP_INTERVAL = 0.4;  // seconds (0.4 / sensitivity)
    private static final double MAX_STEP_INTERVAL = 1.8;  // seconds
    private static final double NEW_SERIES_GAP = 2.0;     // seconds
    private static final int CONV_SIZE = 5;    // smoothing window
    private static final int ACC_SIZE = 20;    // peak-search window
    private static final int MIN_SAMPLES = 10; // wait until the buffer is filled

    /** Ring buffer of the last N floats with the statistics the algorithm needs (Progulkin's _CircularBuffer). */
    private static final class FloatBuffer {
        private final float[] buf;
        private int size = 0; // valid values
        private int head = 0; // next write index

        FloatBuffer(int capacity) { this.buf = new float[capacity]; }

        void add(float v) {
            buf[head] = v;
            head = (head + 1) % buf.length;
            if (size < buf.length) size++;
        }

        int length() { return size; }

        float max() {
            float m = buf[0];
            for (int i = 1; i < size; i++) if (buf[i] > m) m = buf[i];
            return m;
        }

        float min() {
            float m = buf[0];
            for (int i = 1; i < size; i++) if (buf[i] < m) m = buf[i];
            return m;
        }

        float avg() {
            if (size == 0) return 0f;
            float s = 0f;
            for (int i = 0; i < size; i++) s += buf[i];
            return s / size;
        }

        /** Second most recent value, or NaN when fewer than 2 values are stored. */
        float preLast() {
            if (size < 2) return Float.NaN;
            return buf[(head - 2 + buf.length) % buf.length];
        }

        /** True when the most recent value is the maximum of the buffer. */
        boolean isMaxVal() {
            if (size == 0) return false;
            float last = buf[(head - 1 + buf.length) % buf.length];
            for (int i = 0; i < size; i++) if (buf[i] > last) return false;
            return true;
        }

        void clear() { size = 0; head = 0; }
    }

    /** Ring buffer of the last N timestamps (seconds, monotonic). */
    private static final class TimeBuffer {
        private final double[] buf;
        private int size = 0;
        private int head = 0;

        TimeBuffer(int capacity) { this.buf = new double[capacity]; }

        void add(double v) {
            buf[head] = v;
            head = (head + 1) % buf.length;
            if (size < buf.length) size++;
        }

        double preLast() {
            if (size < 2) return Double.NaN;
            return buf[(head - 2 + buf.length) % buf.length];
        }

        void clear() { size = 0; head = 0; }
    }

    private final FloatBuffer convBuffer = new FloatBuffer(CONV_SIZE); // smoothing
    private final FloatBuffer accBuffer = new FloatBuffer(ACC_SIZE);  // peak search
    private final TimeBuffer timeBuffer = new TimeBuffer(ACC_SIZE);   // peak search

    private double stepTimePred = 0; // time of the previous accepted step
    private boolean isStepSeries = false;

    /**
     * Feed one accelerometer sample (m/s^2 including gravity) with its
     * monotonic timestamp in SECONDS. Returns true exactly when the sample
     * completes an accepted step.
     */
    boolean processSample(float x, float y, float z, double timeSec) {
        // Step 1: best axis = max of absolute values.
        float acc = Math.max(Math.max(Math.abs(x), Math.abs(y)), Math.abs(z));

        // Step 2: smoothing (moving average).
        convBuffer.add(acc);
        acc = convBuffer.avg();

        // Step 3: data/time buffers.
        accBuffer.add(acc);
        timeBuffer.add(timeSec);

        // Wait until the buffer is filled.
        if (accBuffer.length() < MIN_SAMPLES) return false;

        // Step 4: min/max and the adaptive threshold.
        float accBufMax = accBuffer.max();
        float accBufMin = accBuffer.min();
        if (accBufMax - accBufMin < MIN_AMPLITUDE) return false; // too little movement
        float levelFindSteps = (accBufMax + accBufMin) / 2f;

        // Step 5: local maximum search.
        float preLast = accBuffer.preLast();
        if (Float.isNaN(preLast) || !accBuffer.isMaxVal() || preLast <= levelFindSteps) return false;

        double stepTimeCandidate = timeBuffer.preLast();
        double dt = stepTimeCandidate - stepTimePred;

        // Step 6: interval checks.
        if (dt > NEW_SERIES_GAP) {
            // A long pause -> a new series begins (its first peak is not counted).
            stepTimePred = stepTimeCandidate;
            isStepSeries = false;
            dt = 0; // the new series' first peak is never accepted below
        }
        if (dt > MIN_STEP_INTERVAL && dt <= MAX_STEP_INTERVAL) {
            boolean counted = isStepSeries;
            isStepSeries = true;
            stepTimePred = stepTimeCandidate;
            return counted;
        }
        return false;
    }

    /** Reset the detection state (call between pause and resume segments). */
    void reset() {
        convBuffer.clear();
        accBuffer.clear();
        timeBuffer.clear();
        stepTimePred = 0;
        isStepSeries = false;
    }
}
