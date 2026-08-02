// A single segmented control: a row of mutually-exclusive options. Generic over
// the option value; `variant` colours the selected one.

import { Button } from '@/components/button';

// The palette a variant may name. This list decides what a caller may ask for.
// The `@source inline` lines in globals.css decide which classes Tailwind
// builds. They are two halves of one list and change together — a colour in one
// and not the other renders unstyled, and nothing reports it.
export type SegmentedVariant =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose';

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
  // The selected segment's colour. Every state is built from it here, not
  // passed in, which keeps them in step. None of the resulting classes appears
  // literally in any source file; all are safelisted in globals.css. Omitted is
  // the neutral treatment, for a control that isn't a play mode's.
  variant?: SegmentedVariant;
  // Gates every segment together. This and the matching Command's `enabled`
  // must be the same flag, or a word leaves the grammar while its segment still
  // runs. Required, not defaulted: an omitted gate is the defect this exists to
  // prevent.
  disabled: boolean;
}) {
  // Both states carry a hover. The selected segment lightens; an unselected one
  // previews the colour it would take. Neither fires while disabled.
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
