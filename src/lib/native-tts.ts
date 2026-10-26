/**
 * Native Capacitor bridge to the Android platform TTS engine
 * (android.speech.tts.TextToSpeech) — Java side: NativeTTSPlugin.java.
 *
 * Why: the Android System WebView (which Capacitor uses on Android 10+)
 * does NOT expose the Web Speech API synthesis side — window.speechSynthesis
 * is simply absent. Chromium never implemented Web Speech synthesis in
 * WebView builds (chromium issue 40417848 / crbug 487187: "They will not be
 * exposed in WebView because they are currently not supported there").
 * No Capacitor or WebSettings flag can enable it.
 *
 * This module is therefore the read-aloud backend inside the Android APK:
 * - speak(): resolves when the utterance finishes (or is stopped)
 * - stop(): stops current speech
 * - getVoices(): voices of the active TTS engine
 * - getEngines(): list of installed TTS engines
 * - setEngine(): switch to a different TTS engine (or back to default)
 * - setVoice(): select a specific voice on the current engine
 * - getCurrentConfig(): read the current engine + voice selection
 * - openSettings(): opens the system "Text-to-speech output" screen
 *
 * In browsers (PWA) this backend is never called — tts.ts routes to the
 * Web Speech API there.
 */

import { registerPlugin } from '@capacitor/core';

export interface NativeTTSVoice {
  name: string;
  lang: string;
  quality?: number;
}

export interface NativeTTSEngine {
  /** Engine package name (e.g. "com.google.android.tts") */
  name: string;
  /** Human-readable label (e.g. "Google текст-речь") */
  label: string;
}

export interface NativeTTSSpeakOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Voice name to use for this utterance (overrides stored selection). */
  voiceName?: string;
}

export interface NativeTTSPluginInterface {
  speak(options: NativeTTSSpeakOptions): Promise<void>;
  stop(): Promise<void>;
  getVoices(): Promise<{ voices: NativeTTSVoice[] }>;
  getEngines(): Promise<{ engines: NativeTTSEngine[] }>;
  setEngine(options: { engineName: string | null }): Promise<{ engineName: string }>;
  setVoice(options: { voiceName: string | null }): Promise<{ voiceName: string }>;
  getCurrentConfig(): Promise<{ engineName: string | null; voiceName: string | null }>;
  openSettings(): Promise<void>;
}

const NativeTTS = registerPlugin<NativeTTSPluginInterface>('NativeTTS');

/**
 * True when running inside the Capacitor Android shell, where the native
 * TTS bridge is bundled with the APK. Uses the same window.Capacitor
 * detection pattern as nativeHttp.ts (SSR-safe).
 */
export function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return false;
  return cap.getPlatform?.() === 'android' || !!(window as any).Capacitor?.Plugins?.NativeTTS;
}

export default NativeTTS;
