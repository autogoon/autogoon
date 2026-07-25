'use client';

// Setup card: what `cumming` does. Tick any number of outcomes; the engine
// picks one at random at the cumming point, so you never know which you'll
// get. At least one must be ticked before Play (the panel gates on it). All
// but the wind-down ignore Stop once started — the safe word is the way out.

import { RING } from '@/components/button';
import { Card } from '@/components/card';
import { useKeywordFlash } from '@/components/keyword-spotter';
import type { AfterPlayOption } from '@/lib/play-modes/goon-engine';

// The spoken word that toggles each outcome. Single words on purpose — the
// recognizer fires per word, so the labels' phrases ("wind down", "stay in")
// wouldn't match. The panel declares the Commands from this map.
export const AFTER_PLAY_WORDS: Record<AfterPlayOption, string> = {
  'wind-down': 'gentle',
  torture: 'torture',
  'stay-in': 'stay',
  eject: 'eject',
};

const OPTIONS: Array<{
  option: AfterPlayOption;
  label: string;
  description: string;
  ignoresVoice: boolean;
}> = [
  {
    option: 'wind-down',
    label: 'Wind-down',
    description: 'A slow, comfortable glide down to a standstill.',
    ignoresVoice: false,
  },
  {
    option: 'torture',
    label: 'Torture',
    description: 'Straight to full speed and held there.',
    ignoresVoice: true,
  },
  {
    option: 'stay-in',
    label: 'Ruin: stay in',
    description: 'Stops dead.',
    ignoresVoice: true,
  },
  {
    option: 'eject',
    label: 'Ruin: eject',
    description:
      'Pushes you out — note it might take a few seconds, so you might want to say cumming earlier, which might change your experience with other options enabled at the same time.',
    ignoresVoice: true,
  },
];

export function AfterPlayCard({
  enabled,
  onToggle,
}: {
  enabled: AfterPlayOption[];
  onToggle: (option: AfterPlayOption, on: boolean) => void;
}) {
  // Light a row up when its word is heard, exactly like a button's voice flash.
  const flashing = useKeywordFlash();
  return (
    <Card title="After-play">
      <p>
        What happens when you say{' '}
        <span className="bg-background text-muted-foreground rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
          cumming
        </span>{' '}
        — picked at random from the ticked outcomes. Say an outcome&apos;s word
        to tick or untick it. Anything that ignores{' '}
        <span className="text-foreground">stop</span> still answers to the safe
        word.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {OPTIONS.map(({ option, label, description, ignoresVoice }) => (
          <label
            key={option}
            className={`flex cursor-pointer items-baseline gap-3 rounded ${
              flashing.has(AFTER_PLAY_WORDS[option]) ? RING : ''
            }`}
          >
            <input
              type="checkbox"
              checked={enabled.includes(option)}
              onChange={(e) => onToggle(option, e.target.checked)}
              className="size-4 translate-y-0.5 accent-blue-600"
            />
            <span>
              <span className="font-medium">{label}</span>
              <span className="bg-background text-muted-foreground ml-2 rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
                {AFTER_PLAY_WORDS[option]}
              </span>
              {ignoresVoice && (
                <span className="ml-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-normal tracking-wide whitespace-nowrap text-white lowercase dark:bg-amber-800">
                  Ignores voice
                </span>
              )}
              <span className="text-muted-foreground ml-3 text-sm">
                {description}
              </span>
            </span>
          </label>
        ))}
      </div>
      {enabled.length === 0 && (
        <p className="mt-3 text-sm text-red-500">
          Tick at least one outcome to play.
        </p>
      )}
    </Card>
  );
}
