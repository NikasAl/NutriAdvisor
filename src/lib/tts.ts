/**
 * Text-to-Speech utility using Web Speech API (speechSynthesis).
 *
 * - Strips markdown before speaking.
 * - Splits long text into paragraph fragments (≤180 chars → further split by sentence).
 * - Provides speak / pause / resume / cancel / getState.
 * - Single-voice policy: starting a new speak cancels any ongoing speech.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type TTSState = 'idle' | 'playing' | 'paused';

export interface TTSOptions {
  rate?: number;          // 0.1 – 10, default 1
  onFragmentStart?: (index: number, total: number, text: string) => void;
  onStateChange?: (state: TTSState) => void;
}

// ─── Internal state ──────────────────────────────────────────────────

let _state: TTSState = 'idle';
let _currentText: string = '';
let _options: TTSOptions = {};
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

export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Check if a Russian voice is available.
 * Voices may load asynchronously, so this can return false initially
 * and become true later. Use waitForVoices() for a reliable check.
 */
export function hasRussianVoice(): boolean {
  if (!isTTSAvailable()) return false;
  const voices = window.speechSynthesis.getVoices();
  return voices.some((v) => v.lang.startsWith('ru'));
}

/**
 * Get list of available Russian voices.
 */
export function getRussianVoices(): SpeechSynthesisVoice[] {
  if (!isTTSAvailable()) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('ru'));
}

/**
 * Wait for voices to load (they load asynchronously in some browsers).
 * Returns true if a Russian voice is available within the timeout.
 */
export function waitForRussianVoice(timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isTTSAvailable()) {
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
    return { ok: false, message: 'Web Speech API недоступен в этом браузере' };
  }

  const hasRu = await waitForRussianVoice(1500);
  if (!hasRu) {
    const voices = window.speechSynthesis.getVoices();
    return {
      ok: false,
      message: voices.length === 0
        ? 'Голоса не загружены. Проверьте настройки TTS устройства.'
        : `Русский голос не найден. Доступны: ${voices.slice(0, 3).map((v) => v.lang).join(', ')}${voices.length > 3 ? '...' : ''}`,
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
 * Speak the given text. Strips markdown, splits into fragments, queues utterances.
 * Cancels any currently playing speech first (single-voice policy).
 */
export function speak(text: string, options?: TTSOptions): void {
  if (!isTTSAvailable()) return;

  // Cancel any ongoing speech
  cancel();

  _currentText = text;
  _options = options ?? {};
  const plainText = stripMarkdown(text);
  _fragments = splitForSpeech(plainText);

  if (_fragments.length === 0 || _fragments.every((f) => !f.trim())) return;

  _currentFragmentIdx = 0;
  queueFragments();
}

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

/**
 * Pause the currently playing speech.
 */
export function pause(): void {
  if (!isTTSAvailable()) return;
  if (_state === 'playing') {
    window.speechSynthesis.pause();
    setState('paused');
  }
}

/**
 * Resume paused speech.
 */
export function resume(): void {
  if (!isTTSAvailable()) return;
  if (_state === 'paused') {
    window.speechSynthesis.resume();
    setState('playing');
  }
}

/**
 * Cancel speech entirely and reset state.
 */
export function cancel(): void {
  if (!isTTSAvailable()) return;
  window.speechSynthesis.cancel();
  _currentText = '';
  _fragments = [];
  _currentFragmentIdx = 0;
  setState('idle');
}

/**
 * Get current TTS state.
 */
export function getState(): TTSState {
  return _state;
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
