"use client";

// A plain <button> with an optional voice-command badge. The badge shows, in
// the corner, the keyword you can say to trigger the button (see the keyword
// spotter), and the button flashes a ring when that keyword is recognised — so
// speaking a word visibly lights up its control, button and voice in lockstep.
// With no badge it renders exactly like a native button.

import type { ComponentProps } from "react";
import { useKeywordFlash } from "@/components/keyword-spotter";

export function Button({
  badge,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { badge?: string }) {
  const flashing = useKeywordFlash();

  if (badge === undefined) {
    return (
      <button {...props} className={className}>
        {children}
      </button>
    );
  }

  const flash = flashing.has(badge)
    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
    : "";
  return (
    <button {...props} className={`relative ${className ?? ""} ${flash}`}>
      {children}
      <span className="text-muted-foreground bg-background pointer-events-none absolute top-1 right-1 rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
        {badge}
      </span>
    </button>
  );
}
