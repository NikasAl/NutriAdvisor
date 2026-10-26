'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Pause } from 'lucide-react';
import { useTTS } from '@/hooks/useTTS';
import { getSourceId as ttsGetSourceId, type TTSState } from '@/lib/tts';

export interface TTSButtonProps {
  /** Markdown text to speak */
  text: string;
  /** Speech rate (0.1–10, default 1) */
  rate?: number;
  /** Whether TTS is enabled in settings (controls disabled state) */
  enabled?: boolean;
  /** Optional identity of this button (e.g. message id). When several
   *  TTS buttons are visible at once (chat), only the button that owns
   *  the current speech shows play/pause state; all others stay idle. */
  sourceId?: string;
  /** Additional className for the button */
  className?: string;
}

const BTN_CLASSES = 'h-6 w-6 p-0';

/**
 * Compact TTS toggle button for AI analysis blocks and chat messages.
 *
 * Icons:
 * - idle → Volume2 (click to play)
 * - playing → Pause (click to pause)
 * - paused → Volume2 (click to resume)
 *
 * When disabled (TTS off in settings), shows VolumeX with tooltip.
 */
export default function TTSButton({ text, rate, enabled = true, sourceId, className }: TTSButtonProps) {
  const { state, play, toggle } = useTTS(text, { rate, sourceId });

  // With sourceId set, reflect the global TTS state only when this button
  // owns the current speech; otherwise always show the idle (play) icon.
  const ownsSpeech = !sourceId || ttsGetSourceId() === sourceId;
  const effectiveState: TTSState = ownsSpeech ? state : 'idle';

  if (!enabled) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`${BTN_CLASSES} text-muted-foreground/40 ${className ?? ''}`}
        disabled
        title="Озвучивание выключено в настройках"
      >
        <VolumeX className="h-3.5 w-3.5" />
      </Button>
    );
  }

  if (!text.trim()) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`${BTN_CLASSES} text-muted-foreground/40 ${className ?? ''}`}
        disabled
        title="Нет текста для озвучивания"
      >
        <Volume2 className="h-3.5 w-3.5" />
      </Button>
    );
  }

  const iconMap: Record<TTSState, React.ReactNode> = {
    idle: <Volume2 className="h-3.5 w-3.5" />,
    playing: <Pause className="h-3.5 w-3.5" />,
    paused: <Volume2 className="h-3.5 w-3.5" />,
  };

  const titleMap: Record<TTSState, string> = {
    idle: 'Озвучить',
    playing: 'Пауза',
    paused: 'Продолжить озвучивание',
  };

  const colorClass: Record<TTSState, string> = {
    idle: 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300',
    playing: 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300',
    paused: 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300',
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`${BTN_CLASSES} ${colorClass[effectiveState]} ${className ?? ''}`}
      onClick={() => (ownsSpeech ? toggle() : play())}
      title={titleMap[effectiveState]}
    >
      {iconMap[effectiveState]}
    </Button>
  );
}
