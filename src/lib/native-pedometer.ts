/**
 * Native Capacitor bridge to the Android step counter / accelerometer
 * (NativePedometerPlugin.java + PedometerService.java) — background step
 * counting for walk/run workout exercises, including the SCREEN-OFF case
 * (phone in the pocket, app in the background, display off).
 *
 * Counting lives natively (PedometerService foreground service, or an
 * in-process engine when the FGS cannot start), because the frozen WebView
 * throttles JS timers and drops plugin events while the screen is off:
 *  - "pedometer" mode: hardware Sensor.TYPE_STEP_COUNTER; every event
 *    carries an ABSOLUTE value (cumulative since boot) and the native side
 *    reports `value - sessionBaseline`, so lost events are harmless.
 *  - "accelerometer" mode: the Progulkin peak-detection algorithm runs in
 *    Java (StepDetector.java) on raw TYPE_ACCELEROMETER samples, so the
 *    fallback also keeps counting with the screen off.
 * JS re-syncs the authoritative count via getSteps() on every visibility
 * resume (freeze/thaw, tab switch, app restart) — see src/lib/pedometer.ts.
 *
 * In browsers (PWA) this plugin is absent and the pedometer service falls
 * back to DeviceMotion ("devicemotion" window events, wrapped by
 * @capacitor/motion) or reports the feature as unavailable; background
 * counting is impossible in a browser and the UI says so honestly.
 */

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Options for the native start() call. */
export interface NativePedometerStartOptions {
  /** Workout set id — lets the service keep its notification total continuous across pause/resume. */
  setId?: string;
  /** Steps JS already accumulated for the set (adopted so the notification never jumps backwards). */
  initialSteps?: number;
  /** Profile step length in meters (default 0.75) — used for the notification distance. */
  stepLengthM?: number;
  /** True when JS explicitly zeroed the count (timer reset): the notification total restarts too. */
  fresh?: boolean;
}

/** Result of the native start() call. */
export interface NativePedometerStartResult {
  /** Which mode the plugin switched to (or "none" when a permission dialog is due). */
  source: 'pedometer' | 'accelerometer' | 'none' | 'unavailable';
  /** False when the device has neither a step counter nor an accelerometer. */
  supported: boolean;
  /** True when ACTIVITY_RECOGNITION must be requested before start() can use the hardware counter. */
  needsPermission?: boolean;
}

export interface NativePedometerPluginInterface {
  start(options?: NativePedometerStartOptions): Promise<NativePedometerStartResult>;
  /** ACTIVITY_RECOGNITION (no-op granted on Android < 10). Resolves { granted }. */
  requestPermission(): Promise<{ granted: boolean }>;
  /**
   * Best-effort POST_NOTIFICATIONS (Android 13+): without it the
   * foreground service runs but its «Тренировка: N шагов» notification is
   * hidden. Resolves { granted }.
   */
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  /**
   * Authoritative session step count + whether counting is running.
   * The freeze/thaw recovery path: events delivered into a frozen WebView
   * may be lost, so JS polls this on every visibility resume instead of
   * trusting the event stream. The payload: { steps: number; running: boolean }.
   */
  getSteps(): Promise<{ steps: number; running: boolean }>;
  stop(): Promise<void>;
  /**
   * Session steps reported by the native side (hardware counter baseline or
   * the native peak detector). The event payload: { steps: number }.
   */
  addListener(
    eventName: 'onStepsChanged',
    listenerFunc: (data: { steps: number }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const NativePedometer = registerPlugin<NativePedometerPluginInterface>('NativePedometer');

/**
 * True when running inside the Capacitor Android shell, where the native
 * pedometer bridge is bundled with the APK. Same window.Capacitor detection
 * pattern as native-tts.ts / nativeHttp.ts (SSR-safe).
 */
export function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return false;
  return cap.getPlatform?.() === 'android' || !!(window as any).Capacitor?.Plugins?.NativePedometer;
}

export default NativePedometer;
