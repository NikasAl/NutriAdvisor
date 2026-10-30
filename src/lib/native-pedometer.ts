/**
 * Native Capacitor bridge to the Android step counter / accelerometer
 * (NativePedometerPlugin.java) — background step counting for walk/run
 * workout exercises.
 *
 * Two modes, decided by the native start():
 *  - "pedometer": hardware Sensor.TYPE_STEP_COUNTER (requires the
 *    ACTIVITY_RECOGNITION runtime permission on Android 10+). Delivers
 *    session steps (relative to a baseline taken at start()) via the
 *    "onStepsChanged" event. JS accumulates segments across pause/resume.
 *  - "accelerometer": raw TYPE_ACCELEROMETER samples (~50 Hz) via the
 *    "onAccel" event. The step-detection algorithm itself runs in JS
 *    (src/lib/pedometer.ts, ported from Progulkin) so the browser PWA and
 *    the APK share one implementation. We stream raw samples natively
 *    because the Android WebView does not reliably dispatch devicemotion
 *    events (chromium bug 178252), while SensorManager always works.
 *
 * In browsers (PWA) this plugin is absent and the pedometer service falls
 * back to DeviceMotion ("devicemotion" window events, wrapped by
 * @capacitor/motion) or reports the feature as unavailable.
 */

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

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
  start(): Promise<NativePedometerStartResult>;
  requestPermission(): Promise<{ granted: boolean }>;
  stop(): Promise<void>;
  /**
   * Steps in the current start() session (hardware counter mode only).
   * The event payload: { steps: number }.
   */
  addListener(
    eventName: 'onStepsChanged',
    listenerFunc: (data: { steps: number }) => void,
  ): Promise<PluginListenerHandle>;
  /**
   * Raw accelerometer sample in m/s² including gravity (fallback mode).
   * The event payload: { x: number; y: number; z: number }.
   */
  addListener(
    eventName: 'onAccel',
    listenerFunc: (data: { x: number; y: number; z: number }) => void,
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
