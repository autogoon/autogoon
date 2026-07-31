'use client';

// A single segmented control: a row of mutually-exclusive options. Generic over
// the option value; the selected one gets `activeClass`.

import { Button } from '@/components/button';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  activeClass,
  disabled,
}: {
  options: ReadonlyArray<{ value: T; label: string; voiceCommand?: string }>;
  value: T;
  onChange: (value: T) => void;
  activeClass: string;
  // Gates every segment together. This and the matching Command's `enabled`
  // must be the same flag, or a word leaves the grammar while its segment still
  // runs. Required, not defaulted: an omitted gate is the defect this exists to
  // prevent.
  disabled: boolean;
}) {
  return (
    // No overflow-hidden: it would clip the press/voice flash ring (which sits
    // just outside each segment). The end segments round their outer corners
    // instead, so the selected background still hugs the rounded border.
    <div className="flex rounded-lg border">
      {options.map((opt, i) => (
        <Button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          voiceCommand={opt.voiceCommand}
          disabled={disabled}
          className={`border-border flex-1 rounded-none border-0 bg-transparent py-3 enabled:hover:bg-transparent ${
            i > 0 ? 'border-l' : ''
          } ${i === 0 ? 'rounded-l-lg' : ''} ${
            i === options.length - 1 ? 'rounded-r-lg' : ''
          } ${value === opt.value ? activeClass : 'text-muted-foreground'}`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
