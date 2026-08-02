// A single segmented control: a row of mutually-exclusive options. Generic over
// the option value; `variant` colours the selected one.

import { Button } from '@/components/button';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant,
  disabled,
}: {
  options: ReadonlyArray<{ value: T; label: string; voiceCommand?: string }>;
  value: T;
  onChange: (value: T) => void;
  // The selected segment's colour, as a palette name (`blue`, `purple`). Both
  // the fill and its half-strength hover are built from it here rather than
  // passed in, so the two can't drift; neither appears literally in any source
  // file, so both shapes are safelisted in globals.css. Omitted is the neutral
  // treatment, for a control that isn't a play mode's.
  variant?: string;
  // Gates every segment together. This and the matching Command's `enabled`
  // must be the same flag, or a word leaves the grammar while its segment still
  // runs. Required, not defaulted: an omitted gate is the defect this exists to
  // prevent.
  disabled: boolean;
}) {
  // Hover lands on both: the selected segment lightens a little, an unselected
  // one previews the colour it would take. Neither fires while disabled.
  const selected =
    variant === undefined
      ? 'bg-secondary text-secondary-foreground enabled:hover:bg-secondary/80'
      : `bg-${variant}-600 text-white enabled:hover:bg-${variant}-600/80`;
  const unselected =
    variant === undefined
      ? 'text-muted-foreground enabled:hover:bg-secondary/50'
      : `text-muted-foreground enabled:hover:bg-${variant}-600/50`;

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
          className={`border-border flex-1 rounded-none border-0 bg-transparent py-3 ${
            i > 0 ? 'border-l' : ''
          } ${i === 0 ? 'rounded-l-lg' : ''} ${
            i === options.length - 1 ? 'rounded-r-lg' : ''
          } ${value === opt.value ? selected : unselected}`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
