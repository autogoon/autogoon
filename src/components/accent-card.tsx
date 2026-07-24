"use client";

// The accent-tinted card the choosers share — the home play-mode list, the
// Companions chooser, the Goonpacks rows and the import confirm sheet: a
// rounded border and diagonal gradient tint in the accent colour (classes
// interpolated from the colour name — safelisted across the palette in
// globals.css), with the tint deepening on hover when the card is clickable.
// `accent: null` drops the tint for a plain border; `dashed` for placeholder-ish
// rows (an incompatible pack). With `badge` the card renders through Button —
// a real <button> carrying the voice-word badge and flash ring — otherwise a
// div, because a card holding its own controls (selects, buttons) can't nest
// in a button.

import type { ReactNode } from "react";
import { Button } from "@/components/button";

export function AccentCard({
  accent,
  dashed = false,
  badge,
  onClick,
  className,
  children,
}: {
  accent: string | null;
  dashed?: boolean;
  badge?: string;
  onClick?: () => void;
  // Extras only (margins, text size) — a caller wanting more layout than the
  // stack brings its own wrapper inside.
  className?: string;
  children: ReactNode;
}) {
  const interactive = onClick !== undefined;
  const shell = [
    "rounded-xl border px-4 py-3 flex flex-col gap-1.5",
    dashed ? "border-dashed" : "",
    accent !== null
      ? `border-${accent}-500 bg-linear-to-br from-${accent}-500/15 to-${accent}-500/5`
      : "",
    accent !== null && interactive
      ? `hover:from-${accent}-500/25 hover:to-${accent}-500/10`
      : "",
    interactive ? "cursor-pointer" : "",
    className ?? "",
  ]
    .filter((c) => c !== "")
    .join(" ");
  if (badge !== undefined) {
    return (
      <Button badge={badge} onClick={onClick} className={shell}>
        {children}
      </Button>
    );
  }
  return (
    <div onClick={onClick} className={shell}>
      {children}
    </div>
  );
}
