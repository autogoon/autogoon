"use client";

// The Stroke manual-override card: two hold buttons that pulse the stroke+/-
// valves directly (voice "up"/"down" does the same, see useStrokeControls, and
// highlights the matching button), plus the algorithm's own Finish command.
// Shared by every algorithm panel — the stroke buttons operate on the device
// layer regardless of which algorithm is running; Finish is supplied per
// algorithm since each one finishes differently.

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { HoldButton } from "@/components/hold-button";

export function StrokeCard({
  disabled,
  strokePulsing,
  onValvePlus,
  onValveMinus,
  onError,
  onFinish,
}: {
  disabled: boolean;
  strokePulsing: "plus" | "minus" | null;
  onValvePlus: (state: boolean) => Promise<unknown>;
  onValveMinus: (state: boolean) => Promise<unknown>;
  onError: (message: string) => void;
  // Every algorithm defines its own Finish command.
  onFinish: () => void;
}) {
  return (
    <Card title="Stroke">
      <div className="flex gap-3">
        <HoldButton
          label="Stroke −"
          badge="down"
          disabled={disabled}
          onValve={onValveMinus}
          onError={onError}
          forcedActive={strokePulsing === "minus"}
        />
        <HoldButton
          label="Stroke +"
          badge="up"
          disabled={disabled}
          onValve={onValvePlus}
          onError={onError}
          forcedActive={strokePulsing === "plus"}
        />
        <Button
          onClick={onFinish}
          disabled={disabled}
          className="flex-1 rounded-lg bg-linear-to-br from-red-600 to-pink-500 py-3 text-lg font-bold text-white disabled:opacity-40"
          badge="finish"
        >
          Finish
        </Button>
      </div>
    </Card>
  );
}
