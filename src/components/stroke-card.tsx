"use client";

// The Stroke manual-override card: two hold buttons that pulse the stroke+/-
// valves directly (voice "up"/"down" does the same, see useStrokeControls, and
// highlights the matching button). Genuinely shared by every algorithm panel —
// the stroke buttons operate on the device layer regardless of which algorithm is
// running. Finish/cumming are algorithm-specific, so each panel renders its own.

import { Card } from "@/components/card";
import { HoldButton } from "@/components/hold-button";

export function StrokeCard({
  strokeDisabled,
  strokePulsing,
  onValvePlus,
  onValveMinus,
  onError,
}: {
  // Manual stroke is valid whenever a device is connected.
  strokeDisabled: boolean;
  strokePulsing: "plus" | "minus" | null;
  onValvePlus: (state: boolean) => Promise<unknown>;
  onValveMinus: (state: boolean) => Promise<unknown>;
  onError: (message: string) => void;
}) {
  return (
    <Card title="Stroke">
      <div className="flex gap-3">
        <HoldButton
          label="Stroke −"
          badge="down"
          disabled={strokeDisabled}
          onValve={onValveMinus}
          onError={onError}
          forcedActive={strokePulsing === "minus"}
        />
        <HoldButton
          label="Stroke +"
          badge="up"
          disabled={strokeDisabled}
          onValve={onValvePlus}
          onError={onError}
          forcedActive={strokePulsing === "plus"}
        />
      </div>
    </Card>
  );
}
