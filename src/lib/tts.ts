/**
 * Text-to-Speech utility — dual backend:
 *
 * 1. Browser/PWA → Web Speech API (window.speechSynthesis).
 * 2. Android APK (Capacitor) → native bridge to the platform TTS engine
 *    (android.speech.tts.TextToSpeech via NativeTTSPlugin.java), because the
 *    Android System WebView deliberately does not expose window.speechSynthesis
 *    (chromium issue 40417848 / crbug 487187). No WebView flag can enable it.
 *
 * Shared behaviour:
 * - Strips markdown before speaking.
 * - Splits long text into fragments (≤180 chars → further split by sentence).
 * - Provides speak / pause / resume / cancel / getState.
 * - Single-voice policy: starting a new speak cancels any ongoing speech.
 *
 * Android note: android.speech.tts has no native pause/resume — pause() stops
 * the engine and remembers the fragment index; resume() re-issues remaining
 * fragments from there (the interrupted fragment restarts from its beginning).
 */

import NativeTTS, { isNativeAndroid } from './native-tts';

// ─── Types ───────────────────────────────────────────────────────────

export type TTSState = 'idle' | 'playing' | 'paused';

export interface TTSOptions {
  rate?: number;          // 0.1 – 10, default 1
  /** Optional identity of the speech initiator (e.g. message id).
   *  When several TTS buttons are visible at once (chat), each button can
   *  ask getSourceId() to know whether the current speech is its own. */
  sourceId?: string;
  onFragmentStart?: (index: number, total: number, text: string) => void;
  onStateChange?: (state: TTSState) => void;
}

export interface TTSEnvironment {
  platform: string;
  isCapacitor: boolean;
  /** window.speechSynthesis present (Web Speech API) */
  webSpeechAvailable: boolean;
  /** native Android TTS bridge bundled in this APK */
  nativeBridge: boolean;
  hint: string;
}

// ─── Internal state ──────────────────────────────────────────────────

let _state: TTSState = 'idle';
let _currentText: string = '';
let _options: TTSOptions = {};
let _sourceId: string | null = null;
let _fragments: string[] = [];
let _currentFragmentIdx = 0;
let _listeners: Array<() => void> = [];

function setState(s: TTSState) {
  _state = s;
  _options.onStateChange?.(s);
  _listeners.forEach((fn) => fn());
}

// ─── Markdown stripping ──────────────────────────────────────────────

/**
 * Strip markdown formatting from text to produce plain speech-friendly text.
 * - Headings: "## Title" → "Title"
 * - Bold/italic/strikethrough markers removed
 * - Inline code: `code` → code
 * - Fenced code blocks removed entirely (not speakable)
 * - Links: [text](url) → text
 * - List markers: "- item" / "* item" / "1. item" → "item"
 * - Horizontal rules: --- → removed
 * - Tables: crude — just keep cell text, lose structure
 * - LaTeX math symbols already replaced by MarkdownRenderer before reaching here,
 *   but we strip any remaining $...$
 */
export function stripMarkdown(md: string): string {
  let text = md;

  // Remove fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, '');

  // Remove horizontal rules
  text = text.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');

  // Remove table pipes but keep cell text
  text = text.replace(/\|/g, ' ');

  // Remove heading markers
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic/strikethrough markers
  text = text.replace(/~~/g, '');
  text = text.replace(/\*\*\*/g, '');
  text = text.replace(/\*\*/g, '');
  text = text.replace(/\*/g, '');
  text = text.replace(/___/g, '');
  text = text.replace(/__/g, '');
  text = text.replace(/_/g, '');

  // Remove inline code backticks
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove links, keep text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove list markers (ul: - * + , ol: 1. )
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Remove remaining $...$ LaTeX
  text = text.replace(/\$[^$]+\$/g, '');

  // Collapse multiple spaces
  text = text.replace(/[ \t]+/g, ' ');

  // Trim lines
  text = text
    .split('\n')
    .map((l) => l.trim())
    .join('\n');

  return text.trim();
}

// ─── Text splitting ──────────────────────────────────────────────────

const MAX_FRAGMENT_LENGTH = 180;

/**
 * Split plain text into speakable fragments.
 * - Split by paragraph (double newline).
 * - If a paragraph > MAX_FRAGMENT_LENGTH, split by sentence.
 * - If a sentence > MAX_FRAGMENT_LENGTH, split at MAX_FRAGMENT_LENGTH (hard break).
 */
export function splitForSpeech(plainText: string): string[] {
  const paragraphs = plainText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const result: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= MAX_FRAGMENT_LENGTH) {
      result.push(para);
      continue;
    }

    // Split by sentence endings followed by space or end-of-string
    const sentences = para.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) || [para];
    let buffer = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if (buffer.length + trimmed.length + 1 <= MAX_FRAGMENT_LENGTH) {
        buffer += (buffer ? ' ' : '') + trimmed;
      } else {
        if (buffer) result.push(buffer);
        if (trimmed.length <= MAX_FRAGMENT_LENGTH) {
          buffer = trimmed;
        } else {
          // Hard break
          for (let i = 0; i < trimmed.length; i += MAX_FRAGMENT_LENGTH) {
            result.push(trimmed.slice(i, i + MAX_FRAGMENT_LENGTH));
          }
          buffer = '';
        }
      }
    }
    if (buffer) result.push(buffer);
  }

  return result.length > 0 ? result : [plainText];
}

// ─── Availability checks ─────────────────────────────────────────────

/**
 * Raw Web Speech API check (browser backend only).
 */
function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * TTS is available when either backend works:
 * - Android APK: native bridge to the system TTS engine is bundled in the APK.
 * - Browser: Web Speech API (window.speechSynthesis) present.
 */
export function isTTSAvailable(): boolean {
  return isNativeAndroid() || isWebSpeechAvailable();
}

/**
 * Detect the runtime environment for TTS diagnostics.
 * Returns platform info, backend flags and a hint for the user.
 */
export function detectTTSEnvironment(): TTSEnvironment {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
  const nativeBridge = isNativeAndroid();
  const webSpeechAvailable = isWebSpeechAvailable();
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edge|OPR/i.test(ua);

  let platform: string;
  let hint: string;

  if (isCapacitor && isAndroid) {
    platform = 'Android (Capacitor)';
    hint = nativeBridge
      ? 'Озвучивание идёт через нативный мост к системному TTS (Android WebView не поддерживает Web Speech API). Движок и голоса берутся из настроек устройства: Настройки → Язык и ввод → Синтез речи.'
      : 'Нативный TTS-мост не найден в этой сборке приложения — пересоберите APK и установите заново.';
  } else if (isCapacitor && isIOS) {
    platform = 'iOS (Capacitor)';
    hint = 'WKWebView (окружение iOS-приложения) не поддерживает Web Speech API — озвучивание на iOS пока недоступно. Используйте веб-версию в Safari.';
  } else if (isAndroid) {
    platform = 'Android (браузер)';
    hint = 'Убедитесь, что в настройках устройства выбран TTS-движок (Google) и скачаны данные русского языка: Настройки → Язык и ввод → Синтез речи.';
  } else if (isIOS) {
    platform = 'iOS (браузер)';
    hint = 'iOS Safari поддерживает синтез речи. Проверьте Настройки → Универсальный доступ → Произносимый контент.';
  } else if (isFirefox) {
    platform = 'Firefox';
    hint = 'Firefox поддерживает синтез речи, но голоса зависят от ОС. Убедитесь, что в системе установлен русский голос.';
  } else if (isChrome) {
    platform = 'Chrome';
    hint = 'Chrome поддерживает синтез речи через системный TTS-движок. Убедитесь, что в ОС доступен русский голос.';
  } else {
    platform = 'Неизвестный';
    hint = 'Проверьте, поддерживает ли ваш браузер Web Speech API (speechSynthesis).';
  }

  return { platform, isCapacitor, webSpeechAvailable, nativeBridge, hint };
}

/**
 * Check if a Russian voice is available (Web Speech API backend only).
 * Voices may load asynchronously, so this can return false initially
 * and become true later. Use waitForVoices() for a reliable check.
 */
export function hasRussianVoice(): boolean {
  if (!isWebSpeechAvailable()) return false;
  const voices = window.speechSynthesis.getVoices();
  return voices.some((v) => v.lang.startsWith('ru'));
}

/**
 * Get list of available Russian voices (Web Speech API backend only).
 */
export function getRussianVoices(): SpeechSynthesisVoice[] {
  if (!isWebSpeechAvailable()) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('ru'));
}

/**
 * Wait for voices to load (they load asynchronously in some browsers).
 * Returns true if a Russian voice is available within the timeout.
 * Web Speech API backend only.
 */
export function waitForRussianVoice(timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isWebSpeechAvailable()) {
      resolve(false);
      return;
    }

    // Check synchronously first
    if (hasRussianVoice()) {
      resolve(true);
      return;
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(hasRussianVoice());
      }
    }, timeoutMs);

    const onVoicesChanged = () => {
      if (hasRussianVoice() && !resolved) {
        resolved = true;
        clearTimeout(timer);
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(true);
      }
    };

    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
  });
}

/**
 * Perform a quick test: speak a short phrase to verify TTS actually works.
 * Returns a result object indicating success/failure and details.
 */
export async function testTTS(): Promise<{ ok: boolean; message: string }> {
  if (!isTTSAvailable()) {
    const env = detectTTSEnvironment();
    return { ok: false, message: `Синтез речи недоступен. Окружение: ${env.platform}. ${env.hint}` };
  }

  // ── Native Android backend ──
  if (isNativeAndroid()) {
    try {
      // Voice list is diagnostic only; speech may work even if it fails.
      let ruVoiceName = '';
      try {
        const { voices } = await NativeTTS.getVoices();
        const ru = voices.filter((v) => (v.lang ?? '').toLowerCase().startsWith('ru'));
        if (ru.length > 0) ruVoiceName = ru[0].name;
      } catch {
        // ignore — diagnostic only
      }

      await NativeTTS.speak({ text: 'Синтез речи включён', lang: 'ru-RU', rate: 1, volume: 1 });

      return {
        ok: true,
        message: ruVoiceName
          ? `Нативный TTS работает (голос: ${ruVoiceName})`
          : 'Нативный TTS работает (системный голос)',
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (/not implemented|unimplemented|plugin does not/i.test(raw)) {
        return {
          ok: false,
          message: 'Нативный TTS-мост не найден в этой сборке приложения — пересоберите APK (npm run apk:debug) и установите заново.',
        };
      }
      return { ok: false, message: `Ошибка нативного TTS: ${raw}` };
    }
  }

  // ── Web Speech API backend ──
  const hasRu = await waitForRussianVoice(1500);
  if (!hasRu) {
    const voices = window.speechSynthesis.getVoices();
    const env = detectTTSEnvironment();
    const androidHint = env.isCapacitor || /Android/i.test(navigator.userAgent)
      ? ' На Android: Настройки → Язык и ввод → Синтез речи → скачайте данные русского языка.'
      : '';
    return {
      ok: false,
      message: voices.length === 0
        ? `Голоса не загружены.${androidHint || ' Проверьте настройки TTS устройства.'}`
        : `Русский голос не найден. Доступны: ${voices.slice(0, 3).map((v) => v.lang).join(', ')}${voices.length > 3 ? '...' : ''}${androidHint}`,
    };
  }

  // Quick test utterance
  return new Promise((resolve) => {
    try {
      const utterance = new SpeechSynthesisUtterance('Синтез речи включён');
      const ruVoice = getRussianVoices()[0];
      if (ruVoice) utterance.voice = ruVoice;
      utterance.rate = 1;
      utterance.volume = 0.5; // quieter for test

      const timer = setTimeout(() => {
        window.speechSynthesis.cancel();
        resolve({ ok: true, message: 'Русский голос доступен' });
      }, 3000);

      utterance.onend = () => {
        clearTimeout(timer);
        resolve({ ok: true, message: 'Русский голос доступен' });
      };

      utterance.onerror = (e) => {
        clearTimeout(timer);
        resolve({ ok: false, message: `Ошибка синтеза: ${e.error || 'неизвестная'}` });
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve({ ok: false, message: 'Не удалось запустить синтез речи' });
    }
  });
}

// ─── Core TTS control ────────────────────────────────────────────────

/**
 * Speak the given text. Strips markdown, splits into fragments, queues them.
 * Cancels any currently playing speech first (single-voice policy).
 * Routes to the native bridge on Android, Web Speech API in browsers.
 */
export function speak(text: string, options?: TTSOptions): void {
  if (!isTTSAvailable()) return;

  // Cancel any ongoing speech
  cancel();

  _currentText = text;
  _options = options ?? {};
  _sourceId = _options.sourceId ?? null;
  const plainText = stripMarkdown(text);
  _fragments = splitForSpeech(plainText);

  if (_fragments.length === 0 || _fragments.every((f) => !f.trim())) {
    _fragments = [];
    return;
  }

  _currentFragmentIdx = 0;

  if (isNativeAndroid()) {
    nativeQueueFrom(0);
  } else {
    queueFragments();
  }
}

// ── Web Speech API backend ──

function queueFragments(): void {
  const synth = window.speechSynthesis;
  const ruVoices = getRussianVoices();
  const preferredVoice = ruVoices[0] ?? null;
  const rate = _options.rate ?? 1;

  for (let i = 0; i < _fragments.length; i++) {
    const fragment = _fragments[i];
    const utterance = new SpeechSynthesisUtterance(fragment);

    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.lang = 'ru-RU';
    utterance.rate = rate;
    utterance.volume = 1;

    const idx = i;

    utterance.onstart = () => {
      _currentFragmentIdx = idx;
      _options.onFragmentStart?.(idx, _fragments.length, fragment);
      if (idx === 0) {
        setState('playing');
      }
    };

    utterance.onend = () => {
      // If this was the last fragment, we're done
      if (idx === _fragments.length - 1) {
        setState('idle');
      }
    };

    utterance.onerror = () => {
      // On error, stop everything
      synth.cancel();
      setState('idle');
    };

    synth.speak(utterance);
  }

  // The first onstart will set state to 'playing'
  // But if synth is already speaking from a previous cancel race, set it explicitly
  setState('playing');
}

// ── Native Android backend ──

let _nativeSession = 0;
let _nativePaused = false;
let _nativeResumeIdx = 0;

/**
 * Sequentially speak _fragments from startIdx through the native bridge.
 * The in-flight speak() promise resolves when the utterance finishes or is
 * stopped — pause()/cancel() rely on that plus session/pause flags to stop
 * the loop.
 */
async function runNativeQueue(session: number, startIdx: number): Promise<void> {
  for (let i = startIdx; i < _fragments.length; i++) {
    if (session !== _nativeSession || _nativePaused) return;

    _currentFragmentIdx = i;
    _options.onFragmentStart?.(i, _fragments.length, _fragments[i]);

    try {
      await NativeTTS.speak({
        text: _fragments[i],
        lang: 'ru-RU',
        rate: _options.rate ?? 1,
        volume: 1,
      });
    } catch (err) {
      if (session !== _nativeSession) return; // superseded by cancel()/new speak()
      console.error('[tts] native speak failed:', err);
      if (session === _nativeSession) {
        setState('idle');
      }
      return;
    }
  }

  if (session === _nativeSession && !_nativePaused) {
    setState('idle');
  }
}

function nativeQueueFrom(startIdx: number): void {
  _nativeSession++;
  _nativePaused = false;
  setState('playing');
  void runNativeQueue(_nativeSession, startIdx);
}

/**
 * Pause the currently playing speech.
 */
export function pause(): void {
  if (!isTTSAvailable()) return;
  if (_state !== 'playing') return;

  if (isNativeAndroid()) {
    // android.speech.tts has no pause: stop the engine, remember the fragment.
    // The interrupted fragment restarts from its beginning on resume.
    _nativePaused = true;
    _nativeResumeIdx = _currentFragmentIdx;
    void NativeTTS.stop().catch(() => {});
    setState('paused');
    return;
  }

  window.speechSynthesis.pause();
  setState('paused');
}

/**
 * Resume paused speech.
 */
export function resume(): void {
  if (!isTTSAvailable()) return;
  if (_state !== 'paused') return;

  if (isNativeAndroid()) {
    nativeQueueFrom(_nativeResumeIdx);
    return;
  }

  window.speechSynthesis.resume();
  setState('playing');
}

/**
 * Cancel speech entirely and reset state.
 */
export function cancel(): void {
  if (!isTTSAvailable()) return;

  if (isNativeAndroid()) {
    _nativeSession++;
    _nativePaused = false;
    void NativeTTS.stop().catch(() => {});
    _currentText = '';
    _fragments = [];
    _currentFragmentIdx = 0;
    _sourceId = null;
    setState('idle');
    return;
  }

  window.speechSynthesis.cancel();
  _currentText = '';
  _fragments = [];
  _currentFragmentIdx = 0;
  _sourceId = null;
  setState('idle');
}

/**
 * Get current TTS state.
 */
export function getState(): TTSState {
  return _state;
}

/**
 * Get the sourceId of the current speech (who initiated it), or null.
 * Lets multiple visible TTS buttons (e.g. chat messages) show the
 * play/pause state only on the button that owns the current speech.
 */
export function getSourceId(): string | null {
  return _sourceId;
}

/**
 * Subscribe to state changes. Returns unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}
