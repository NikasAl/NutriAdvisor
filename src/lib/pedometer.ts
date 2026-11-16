/**
 * Workout pedometer service — a port of the Progulkin (github.com/NikasAl/progulkin)
 * pedometer stack to NutriAdvisor's TypeScript/Next.js stack:
 *
 *  - lib/services/pedometer_service.dart → the accelerometer fallback
 *    algorithm below (smoothing, peak picking, adaptive threshold, valid
 *    step interval 0.4–1.8 s) and the pause/resume-without-reset semantics;
 *  - lib/providers/pedometer_provider.dart → accumulation + distance in
 *    meters/km;
 *  - lib/models/distance_source.dart → only the "pedometer" source is used
 *    here: distance = steps × step length (a profile setting).
 *
 * Backends, chosen per start:
 *  1. Native (APK, PedometerService foreground service) — counts with the
 *     SCREEN OFF (phone in the pocket, app in the background). Both sensor
 *     modes report SESSION steps through "onStepsChanged" and the
 *     authoritative value is polled via getSteps() on every visibility
 *     resume, because the frozen WebView loses events:
 *     - "native-pedometer": hardware Sensor.TYPE_STEP_COUNTER, baseline
 *       accumulation natively (cumulative value - session baseline) — lost
 *       events are harmless by design;
 *     - "native-accel": the Progulkin peak-detection algorithm runs in JAVA
 *       (StepDetector.java, same smoothing/peaks/adaptive threshold) on raw
 *       TYPE_ACCELEROMETER samples — so the fallback also survives the
 *       screen-off WebView freeze. (The algorithm below is kept ONLY for
 *       the browser path.)
 *  2. Browser DeviceMotion fallback (PWA) — THIS algorithm in JS via
 *     @capacitor/motion (the official plugin; note that "@capacitor/sensors"
 *     from the original task brief does not exist in the npm registry —
 *     Motion is its official successor and is web-only in v8). A browser
 *     cannot count with the screen off or in background tabs — the UI says
 *     so honestly.
 *  3. If nothing works (desktop browser, sensorless device) the service
 *     reports source = "unavailable" and the UI shows a hint instead of
 *     step counts.
 *
 * The service is a module-level singleton ON PURPOSE: the workout panel
 * unmounts when the user switches tabs, but a running exercise timer (and
 * its step counting) must keep going in the background. The panel re-syncs
 * on mount; native sessions are re-synced on visibilitychange below.
 */

import { Motion } from '@capacitor/motion';
import type { PluginListenerHandle } from '@capacitor/core';
import NativePedometer, { isNativeAndroid } from './native-pedometer';

/** Where the live step count is coming from right now. */
export type PedometerSource = 'pedometer' | 'accelerometer' | 'unavailable';

/** Immutable snapshot published to subscribers on every change. */
export interface PedometerSnapshot {
  /** Steps accumulated for the currently attached exercise (across pauses). */
  steps: number;
  /** distanceM = steps × stepLength (meters). */
  distanceM: number;
  source: PedometerSource;
  /** True while a sensor stream is active (timer running). */
  counting: boolean;
  /** WorkoutSet.id the counter is attached to (null = detached). */
  activeSetId: string | null;
}

/** Default step length, same as Progulkin's _averageStepLength. */
export const DEFAULT_STEP_LENGTH_M = 0.75;
/** Progulkin clamps the step length to 0.5–1.0 m. */
export const STEP_LENGTH_MIN_M = 0.5;
export const STEP_LENGTH_MAX_M = 1.0;

/** Circular buffer of the last N values with buffer statistics (Progulkin's _CircularBuffer). */
class CircularBuffer {
  private buf: number[] = [];
  constructor(private readonly maxSize: number) {}

  add(value: number) {
    this.buf.push(value);
    if (this.buf.length > this.maxSize) this.buf.shift();
  }
  get values(): readonly number[] {
    return this.buf;
  }
  get length(): number {
    return this.buf.length;
  }
  get max(): number {
    let m = this.buf[0];
    for (const v of this.buf) if (v > m) m = v;
    return m;
  }
  get min(): number {
    let m = this.buf[0];
    for (const v of this.buf) if (v < m) m = v;
    return m;
  }
  get avg(): number {
    if (this.buf.length === 0) return 0;
    let s = 0;
    for (const v of this.buf) s += v;
    return s / this.buf.length;
  }
  get last(): number {
    return this.buf[this.buf.length - 1];
  }
  get preLast(): number | null {
    return this.buf.length >= 2 ? this.buf[this.buf.length - 2] : null;
  }
  /** True when the last value is the maximum of the buffer. */
  get isMaxVal(): boolean {
    if (this.buf.length === 0) return false;
    const lastVal = this.last;
    for (const v of this.buf) if (v > lastVal) return false;
    return true;
  }
  clear() {
    this.buf = [];
  }
}

/**
 * Keywords (lowercase substrings) marking a walk/run-like exercise whose
 * execution counts steps. Covers ходьба/бег and close relatives; anything
 * else (велосипед, плавание, силовые) never activates the pedometer.
 */
const WALK_RUN_KEYWORDS = [
  'ходьб', // ходьба, скандинавская ходьба, ходьба на месте…
  'шаг',  // шаги, шаговый аэробика…
  'бег',  // бег, беговая дорожка, бег на лыжах…
  'спринт', // спринт, интервальный спринт
  'марш', // марш-бросок
  'walk', // walk, walking, nordic walking…
  'run',  // run, running, treadmill run…
  'jog',  // jog, jogging
  'treadmill',
  'hik',  // hike, hiking
];

/** True when the pedometer should count steps for an exercise with this name. */
export function isWalkRunName(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return WALK_RUN_KEYWORDS.some((kw) => lower.includes(kw));
}

class WorkoutPedometerService {
  private listeners = new Set<(snap: PedometerSnapshot) => void>();

  // ── Accumulation (Progulkin provider semantics) ────────────────────
  /** Steps flushed from finished segments (native pedometer mode). */
  private baseSteps = 0;
  /** Steps detected in the current streaming session. */
  private segmentSteps = 0;
  private source: PedometerSource = 'unavailable';
  private counting = false;
  private activeSetId: string | null = null;

  /** Average step length in meters (profile setting, Progulkin clamps 0.5–1.0). */
  private stepLengthM = DEFAULT_STEP_LENGTH_M;

  // ── Backend handles ────────────────────────────────────────────────
  private nativeStepsHandle: PluginListenerHandle | null = null;
  private motionHandle: PluginListenerHandle | null = null;
  /** Backend that the current streams come from. Both native backends are session-based (events + getSteps poll). */
  private backend: 'native-pedometer' | 'native-accel' | 'web-motion' | null = null;
  /** Settle timer for web motion: if samples don't arrive at sensor rate, mark unavailable. */
  private webProbeTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Progulkin accelerometer algorithm state ────────────────────────
  // Sensitivity 1.0 (Progulkin's default; 0.5–2.0 range).
  private readonly sensitivity = 1.0;
  private readonly convBuffer = new CircularBuffer(5);   // smoothing (convBuffer)
  private readonly accBuffer = new CircularBuffer(20);   // peak search (accBuffer)
  private readonly timeBuffer = new CircularBuffer(20);  // peak search (timeBuffer)
  private stepTimePred = 0;          // time of the previous accepted step
  private isStepSeries = false;      // a step series is in progress
  private isJustStarted = true;      // re-normalize time on the next sample
  private startTime = 0;             // normalization origin (s)
  /** Steps detected by the accelerometer algorithm (persists across resume). */
  private detectedSteps = 0;

  // ── Public API ─────────────────────────────────────────────────────

  subscribe(fn: (snap: PedometerSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  getSnapshot(): PedometerSnapshot {
    const steps = this.totalSteps();
    return {
      steps,
      distanceM: steps * this.stepLengthM,
      source: this.source,
      counting: this.counting,
      activeSetId: this.activeSetId,
    };
  }

  /** Set the step length from the profile (missing value → default 0.75 m). */
  setStepLength(stepLengthM?: number | null) {
    const v = typeof stepLengthM === 'number' && Number.isFinite(stepLengthM)
      ? stepLengthM
      : DEFAULT_STEP_LENGTH_M;
    this.stepLengthM = Math.min(STEP_LENGTH_MAX_M, Math.max(STEP_LENGTH_MIN_M, v));
    this.publish();
  }

  getStepLength(): number {
    return this.stepLengthM;
  }

  /**
   * Attach counting to a workout set and start streaming (fresh segment;
   * accumulated steps are kept). If another set is attached, its numbers
   * were already flushed by the panel before calling this.
   *
   * @param savedSteps steps previously persisted on the set (e.g. when
   *        editing a saved workout) — adopted as the starting total so a
   *        fresh app session continues the count instead of zeroing it.
   */
  async attach(setId: string, savedSteps = 0): Promise<PedometerSnapshot> {
    if (this.activeSetId && this.activeSetId !== setId) {
      // A different set was attached — start its count from zero (both
      // backend counters are reset; the old numbers are already saved in
      // the previous set by the panel).
      this.baseSteps = 0;
      this.segmentSteps = 0;
      this.detectedSteps = 0;
      this.resetAccelState();
    }
    this.activeSetId = setId;
    if (savedSteps > 0 && this.totalSteps() === 0 && !this.backend) {
      // Fresh service session (page reload / first edit): adopt the saved
      // count as the base so «возобновление без сброса» also holds across
      // app restarts. baseSteps contributes to both backend totals.
      this.baseSteps = savedSteps;
    }
    if (!this.counting) {
      await this.startStreaming();
    }
    return this.getSnapshot();
  }

  /**
   * Pause: stop the streams and keep everything accumulated
   * (Progulkin pauseCounting — «без сброса счётчика»).
   */
  async pause(): Promise<void> {
    await this.stopStreaming();
    this.publish();
  }

  /**
   * Detach completely: pause AND forget the set binding. Steps stay
   * accumulated until reset() so the UI keeps displaying them.
   */
  async detach(): Promise<void> {
    await this.pause();
    this.activeSetId = null;
    this.publish();
  }

  /** Zero everything (counter + buffers) and stop streaming. */
  async reset(): Promise<void> {
    await this.stopStreaming();
    this.baseSteps = 0;
    this.segmentSteps = 0;
    this.detectedSteps = 0;
    this.source = 'unavailable';
    this.resetAccelState();
    this.publish();
  }

  // ── Internals ──────────────────────────────────────────────────────

  private totalSteps(): number {
    // Both native backends are session-based: base (finished segments)
    // + the current native session (events + getSteps poll).
    if (this.backend === 'native-pedometer' || this.backend === 'native-accel') {
      return this.baseSteps + this.segmentSteps;
    }
    return this.detectedSteps + this.baseSteps;
  }

  private resetAccelState() {
    this.convBuffer.clear();
    this.accBuffer.clear();
    this.timeBuffer.clear();
    this.stepTimePred = 0;
    this.isStepSeries = false;
    this.isJustStarted = true;
  }

  private publish() {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch {
        // listener errors must never break counting
      }
    }
  }

  /** Add steps of the finished streaming session to the accumulated base. */
  private flushSegment() {
    if (this.backend === 'native-pedometer' || this.backend === 'native-accel') {
      this.baseSteps += this.segmentSteps;
      this.segmentSteps = 0;
    }
    // Accelerometer mode: detectedSteps is already cumulative across
    // sessions (Progulkin resume semantics), nothing to flush.
  }

  private async stopStreaming() {
    if (this.webProbeTimer) {
      clearTimeout(this.webProbeTimer);
      this.webProbeTimer = null;
    }
    try {
      if (this.nativeStepsHandle) {
        await this.nativeStepsHandle.remove();
        this.nativeStepsHandle = null;
      }
      if (this.motionHandle) {
        await this.motionHandle.remove();
        this.motionHandle = null;
      }
      if (this.backend === 'native-pedometer' || this.backend === 'native-accel') {
        // Freeze/thaw safety: events delivered into a frozen WebView may
        // have been lost, so poll the AUTHORITATIVE native session count
        // before tearing the native session down.
        const live = await NativePedometer.getSteps().catch(() => null);
        if (live && typeof live.steps === 'number' && live.steps > this.segmentSteps) {
          this.segmentSteps = live.steps;
        }
        await NativePedometer.stop();
      }
    } catch {
      // best-effort cleanup
    }
    this.flushSegment();
    this.backend = null;
    this.counting = false;
  }

  /** Start the best available backend. Sets `source`, `backend`, `counting`. */
  private async startStreaming(): Promise<void> {
    // 1) Native (APK): PedometerService foreground service — counts with the
    //    screen off. Both sensor modes report session steps natively.
    if (isNativeAndroid()) {
      const opts = {
        setId: this.activeSetId ?? undefined,
        initialSteps: this.totalSteps(),
        stepLengthM: this.stepLengthM,
        // Zero count (first start / after reset): the native notification
        // total must restart as well instead of continuing a stale value.
        fresh: this.totalSteps() === 0,
      };
      // Best-effort: without POST_NOTIFICATIONS (Android 13+) the service
      // still counts, but its «Тренировка: N шагов» notification stays hidden.
      await NativePedometer.requestNotificationPermission().catch(() => null);
      let res = await NativePedometer.start(opts).catch(() => null);
      if (res?.needsPermission) {
        const perm = await NativePedometer.requestPermission().catch(() => null);
        // Re-decide the backend after the dialog (granted → counter, denied → accel).
        res = await NativePedometer.start(opts).catch(() => null);
        if (res && res.source === 'pedometer' && !perm?.granted) {
          // Should not happen (start() re-checks the state), just be safe:
          res = { source: 'accelerometer', supported: true };
        }
      }
      if (res && (res.source === 'pedometer' || res.source === 'accelerometer') && res.supported) {
        this.backend = res.source === 'pedometer' ? 'native-pedometer' : 'native-accel';
        this.source = res.source;
        this.segmentSteps = 0; // fresh native session; baseSteps keeps the previous segments
        this.counting = true;
        this.nativeStepsHandle = await NativePedometer.addListener('onStepsChanged', (data) => {
          this.segmentSteps = Math.max(0, Math.round(data.steps));
          this.publish();
        });
        this.publish();
        return;
      }
      this.source = 'unavailable';
      this.counting = false;
      this.publish();
      return;
    }

    // 2) Browser DeviceMotion fallback (PWA).
    await this.startWebMotion();
  }

  /**
   * Freeze/thaw + tab-switch + app-restart recovery: pull the authoritative
   * native session count and rebuild the current segment from it. Events
   * delivered into a frozen WebView are lost, so this poll — not the event
   * stream — is the source of truth on resume. No-op for the browser
   * backend (nothing native to sync with).
   */
  async resyncFromNative(): Promise<void> {
    if (this.backend !== 'native-pedometer' && this.backend !== 'native-accel') return;
    if (!this.counting) return;
    const live = await NativePedometer.getSteps().catch(() => null);
    if (!live || typeof live.steps !== 'number') return;
    if (live.steps > this.segmentSteps) {
      this.segmentSteps = live.steps;
    }
    this.publish();
  }

  private async startWebMotion(): Promise<void> {
    if (typeof window === 'undefined' || typeof (window as any).DeviceMotionEvent === 'undefined') {
      this.source = 'unavailable';
      this.counting = false;
      this.publish();
      return;
    }
    // iOS 13+ gates DeviceMotion behind a permission request; it must be
    // called from a user gesture — attach() is always triggered by the
    // timer Play button.
    const dm = (window as any).DeviceMotionEvent;
    if (typeof dm?.requestPermission === 'function') {
      try {
        const res = await dm.requestPermission();
        if (res !== 'granted') {
          this.source = 'unavailable';
          this.counting = false;
          this.publish();
          return;
        }
      } catch {
        this.source = 'unavailable';
        this.counting = false;
        this.publish();
        return;
      }
    }

    this.resetAccelState();
    this.backend = 'web-motion';
    this.source = 'accelerometer';
    this.counting = true;

    let webSampleCount = 0;
    this.motionHandle = await Motion.addListener('accel', (event) => {
      // Prefer gravity-included values (Progulkin used Flutter's
      // accelerometerEvents, which include gravity).
      const a = event.accelerationIncludingGravity ?? event.acceleration;
      if (!a) return;
      webSampleCount++;
      this.processAccelerometerSample(a.x, a.y, a.z);
    });

    // Desktop browsers expose DeviceMotionEvent but either never fire it or
    // emit stray single events with no sensor behind them. A real
    // accelerometer streams at 10–60 Hz, so after a short grace period we
    // declare the feature unavailable unless a sensor-like rate arrived
    // («функция отключена с подсказкой»).
    this.webProbeTimer = setTimeout(() => {
      if (webSampleCount < 10 && this.backend === 'web-motion') {
        void this.stopStreaming();
        this.source = 'unavailable';
        this.publish();
      }
    }, 3000);

    this.publish();
  }

  /**
   * One accelerometer sample → the Progulkin step-detection algorithm
   * (ported 1:1 from lib/services/pedometer_service.dart; on the APK the
   * same algorithm runs natively in StepDetector.java — this JS copy is
   * only used by the browser DeviceMotion backend):
   *   1. take the max absolute axis value (NOT the magnitude);
   *   2. smooth with a 5-sample moving average;
   *   3. keep 20-sample acc/time buffers, wait for ≥10 samples;
   *   4. adaptive threshold = (bufferMax + bufferMin) / 2,
   *      skip when amplitude < 1.0 / sensitivity;
   *   5. local maximum + previous value above the threshold → step
   *      candidate;
   *   6. accept when the interval to the previous step is 0.4–1.8 s and a
   *      series is running; a >2.0 s gap starts a new series.
   */
  private processAccelerometerSample(x: number, y: number, z: number) {
    const time = performance.now() / 1000; // seconds, monotonic

    if (this.isJustStarted) {
      this.startTime = time;
      this.isJustStarted = false;
    }
    const normalizedTime = time - this.startTime;

    // Step 1: best axis = max of absolute values.
    const xy = Math.abs(x);
    const xz = Math.abs(y);
    const zy = Math.abs(z);
    let acc = Math.max(xy, xz, zy);

    // Step 2: smoothing (moving average).
    this.convBuffer.add(acc);
    acc = this.convBuffer.avg;

    // Step 3: buffers.
    this.accBuffer.add(acc);
    this.timeBuffer.add(normalizedTime);

    // Wait until the buffer is filled.
    if (this.accBuffer.length < 10) return;

    // Step 4: min/max and the adaptive threshold.
    const accBufMax = this.accBuffer.max;
    const accBufMin = this.accBuffer.min;
    const amplitude = accBufMax - accBufMin;
    const minAmplitude = 1.0 / this.sensitivity;
    if (amplitude < minAmplitude) return; // too little movement

    const levelFindSteps = (accBufMax + accBufMin) / 2;

    // Step 5: local maximum search.
    const preLast = this.accBuffer.preLast;
    if (this.accBuffer.isMaxVal && preLast !== null && preLast > levelFindSteps) {
      const stepTimeCandidate = this.timeBuffer.preLast ?? normalizedTime;
      const dt = stepTimeCandidate - this.stepTimePred;

      // Step 6: interval checks.
      if (stepTimeCandidate - this.stepTimePred > 2.0) {
        // A long pause → a new series begins (its first peak is not counted).
        this.stepTimePred = stepTimeCandidate;
        this.isStepSeries = false;
      }

      // Acceptable interval between steps: 0.4–1.8 s (adjusted by sensitivity).
      const minStepInterval = 0.4 / this.sensitivity;
      const maxStepInterval = 1.8;
      if (dt > minStepInterval && dt <= maxStepInterval) {
        if (this.isStepSeries) {
          this.detectedSteps++;
          this.publish();
        }
        this.isStepSeries = true;
        this.stepTimePred = stepTimeCandidate;
      }
    }
  }
}

/** Module-level singleton: keeps counting in the background while the workout panel is unmounted. */
export const workoutPedometer = new WorkoutPedometerService();

/**
 * Screen-off / freeze-thaw recovery (APK): when the app becomes visible
 * again, the WebView may have lost "onStepsChanged" events while it was
 * frozen — pull the authoritative native session count instead of trusting
 * the event stream. Covers: screen off→on, tab switch back, app return
 * from the background (and the first paint after a process kill, where the
 * count restarts from the draft-adopted base).
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void workoutPedometer.resyncFromNative();
    }
  });
  // Some WebViews only fire pageshow (bfcache restore) without a
  // visibilitychange transition — sync on that too, it is a no-op when
  // there is nothing to update.
  window.addEventListener('pageshow', () => {
    void workoutPedometer.resyncFromNative();
  });
}

/** Format meters the Progulkin way: «850 м» / «1,42 км». */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2).replace('.', ',')} км`;
  return `${Math.round(meters)} м`;
}
