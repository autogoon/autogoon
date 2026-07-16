"use client";

// Setup card: what `cumming` does. Tick any number of outcomes; the engine
// picks one at random at the cumming point, so you never know which you'll
// get. At least one must be ticked before Play (the panel gates on it). All
// but the wind-down ignore Stop once started — the safe word is the way out.

import { Card } from "@/components/card";
import type { AfterPlayOption } from "@/lib/algorithms/goon-engine";

const OPTIONS: Array<{
  option: AfterPlayOption;
  label: string;
  description: string;
  ignoresStop: boolean;
}> = [
  {
    option: "wind-down",
    label: "Wind-down",
    description: "A slow, comfortable glide down to a standstill.",
    ignoresStop: false,
  },
  {
    option: "torture",
    label: "Torture",
    description: "Straight to full speed and held there.",
    ignoresStop: true,
  },
  {
    option: "stay-in",
    label: "Stay-in",
    description: "Stops dead.",
    ignoresStop: true,
  },
  {
    option: "eject",
    label: "Eject",
    description:
      "Pushes you out — note it might take a few seconds, so you might want to say cumming earlier, which might change your experience with other options enabled at the same time.",
    ignoresStop: true,
  },
];

export function AfterPlayCard({
  enabled,
  onToggle,
}: {
  enabled: AfterPlayOption[];
  onToggle: (option: AfterPlayOption, on: boolean) => void;
}) {
  return (
    <Card title="After-play">
      <p className="text-muted-foreground text-sm">
        What happens when you say <code>cumming</code> — picked at random from
        the ticked outcomes. Anything that ignores{" "}
        <span className="text-foreground">stop</span> still answers to the safe
        word.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {OPTIONS.map(({ option, label, description, ignoresStop }) => (
          <label
            key={option}
            className="flex cursor-pointer items-baseline gap-3"
          >
            <input
              type="checkbox"
              checked={enabled.includes(option)}
              onChange={(e) => onToggle(option, e.target.checked)}
              className="size-4 translate-y-0.5 accent-blue-600"
            />
            <span>
              <span className="font-medium">{label}</span>
              {ignoresStop && (
                <span className="ml-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-normal tracking-wide whitespace-nowrap text-white uppercase dark:bg-amber-800">
                  Ignores Stop
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
