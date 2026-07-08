"use client";

// A plain <button> with an optional voice-command badge, plus a "flash" highlight
// that lights the control up from two triggers, one look: pressing it (the
// browser's native :active state) and its badge word being recognised by the
// keyword spotter. So a click and the spoken word look identical, and every
// button flashes on press whether or not it has a voice command. The badge shows,
// in the corner, the keyword you can say to trigger it.

import type { ComponentProps } from "react";
import { useKeywordFlash } from "@/components/keyword-spotter";

// The flash ring: applied on press via the `active:` variant (every button), and
// added directly while a badge's voice word is in the flashing set.
const RING = "ring-2 ring-foreground ring-offset-2 ring-offset-background";
const ACTIVE_RING =
  "active:ring-2 active:ring-foreground active:ring-offset-2 active:ring-offset-background";

export function Button({
  badge,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { badge?: string }) {
  const flashing = useKeywordFlash();

  if (badge === undefined) {
    return (
      <button {...props} className={`${className ?? ""} ${ACTIVE_RING}`}>
        {children}
      </button>
    );
  }

  const voiceFlash = flashing.has(badge) ? RING : "";
  return (
    <button
      {...props}
      className={`relative ${className ?? ""} ${ACTIVE_RING} ${voiceFlash}`}
    >
      {children}
      <span className="text-muted-foreground bg-background pointer-events-none absolute top-1 right-1 rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
        {badge}
      </span>
    </button>
  );
}
