'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  speak as ttsSpeak,
  pause as ttsPause,
  resume as ttsResume,
  cancel as ttsCancel,
  getState as ttsGetState,
  subscribe as ttsSubscribe,
  type TTSState,
  type TTSOptions,
} from '@/lib/tts';

export interface UseTTSReturn {
  state: TTSState;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * React hook for TTS. Manages state reactivity and auto-cancel on unmount.
 *
 * @param text - The markdown text to speak
 * @param options - TTS options (rate, onFragmentStart, etc.)
 */
export function useTTS(text: string, options?: TTSOptions): UseTTSReturn {
  const [state, setState] = useState<TTSState>(ttsGetState());
  const textRef = useRef(text);
  const optionsRef = useRef(options);

  // Keep refs up to date in effect (not during render — react-hooks/refs rule)
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Subscribe to TTS state changes
  useEffect(() => {
    const unsub = ttsSubscribe(() => {
      setState(ttsGetState());
    });
    return unsub;
  }, []);

  // Cancel on unmount
  useEffect(() => {
    return () => {
      ttsCancel();
    };
  }, []);

  const play = useCallback(() => {
    ttsSpeak(textRef.current, optionsRef.current);
  }, []);

  const pause = useCallback(() => {
    ttsPause();
  }, []);

  const resume = useCallback(() => {
    ttsResume();
  }, []);

  const stop = useCallback(() => {
    ttsCancel();
  }, []);

  const toggle = useCallback(() => {
    const current = ttsGetState();
    if (current === 'idle') {
      ttsSpeak(textRef.current, optionsRef.current);
    } else if (current === 'playing') {
      ttsPause();
    } else if (current === 'paused') {
      ttsResume();
    }
  }, []);

  return { state, play, pause, resume, stop, toggle };
}
