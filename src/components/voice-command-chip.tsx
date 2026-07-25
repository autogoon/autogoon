// The chip naming a control's voice command — say the word to trigger it.
// One look everywhere: Button and Card both render this. The pill carries no
// positioning of its own — the parent anchors it (Button pins it to its own
// corner; Card lays it at the right end of its floating action cluster).

import { twMerge } from 'tailwind-merge';

export function VoiceCommandChip({
  word,
  className,
}: {
  word: string;
  className?: string;
}) {
  return (
    <span
      className={twMerge(
        'text-background pointer-events-none rounded-full bg-amber-400 px-2 py-1 text-sm leading-none font-bold',
        className,
      )}
    >
      {word}
    </span>
  );
}
