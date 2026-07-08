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
// added directly while a badge's voice word is in the flashing set. The ring is a
// box-shadow, so it paints in DOM order — in a segmented row a later sibling would
// cover the ring's overlapping edge. z-10 (with relative for a stacking context)
// lifts the flashing button above its neighbours so the ring shows in full.
const RING = "relative z-10 ring-2 ring-foreground ring-offset-2 ring-offset-background";
const ACTIVE_RING =
  "active:relative active:z-10 active:ring-2 active:ring-foreground active:ring-offset-2 active:ring-offset-background";

export function Button({
  badge,
  flash = true,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { badge?: string; flash?: boolean }) {
  const flashing = useKeywordFlash();
  // Some controls carry their own "activated" signal (the tabs restyle the
  // selected tab), so they opt out of the press/voice flash with flash={false}.
  const activeRing = flash ? ACTIVE_RING : "";

  if (badge === undefined) {
    return (
      <button {...props} className={`${className ?? ""} ${activeRing}`}>
        {children}
      </button>
    );
  }

  const voiceFlash = flash && flashing.has(badge) ? RING : "";
  return (
    <button
      {...props}
      className={`relative ${className ?? ""} ${activeRing} ${voiceFlash}`}
    >
      {children}
      <span className="text-muted-foreground bg-background pointer-events-none absolute top-1 right-1 rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
        {badge}
      </span>
    </button>
  );
}
