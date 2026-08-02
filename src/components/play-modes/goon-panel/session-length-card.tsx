// Setup card: how long the Goon build runs. One setup concern per card, shown
// only until Play. The card is display + slider; its voice words (`shorter` /
// `longer`) are declared by the panel, which owns the length state.

import { Card } from '@/components/card';
import { Slider } from '@/components/slider';

export const MIN_SESSION_MINUTES = 10;
export const MAX_SESSION_MINUTES = 120;
export const SESSION_STEP_MINUTES = 5;

export function SessionLengthCard({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <Card title="Session length">
      <div className="text-muted-foreground flex justify-between text-sm">
        <span>Build length</span>
        <span className="tabular-nums">{minutes} min</span>
      </div>
      <Slider
        value={minutes}
        min={MIN_SESSION_MINUTES}
        max={MAX_SESSION_MINUTES}
        step={SESSION_STEP_MINUTES}
        onChange={onChange}
      />
      <p className="text-muted-foreground mt-2 text-sm">
        The build scales to fit — a shorter session ramps harder. Say{' '}
        <code>shorter</code> / <code>longer</code> to step it.
      </p>
    </Card>
  );
}
