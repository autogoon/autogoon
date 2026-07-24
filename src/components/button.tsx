"use client";

// A plain <button> with an optional voice command, plus a "flash" highlight
// that lights the control up from two triggers, one look: pressing it (the
// browser's native :active state) and its voiceCommand word being recognised
// by the keyword spotter. So a click and the spoken word look identical, and
// every button flashes on press whether or not it has a voice command. The
// word shows as a chip in the corner — say it to trigger the button.
//
// Every button starts from the standard control style (CONTROL_BUTTON —
// visible at rest on the flat pages); className OVERRIDES it per utility via
// tailwind-merge, so a caller states only its differences (a louder fill, a
// different size) and inherits the rest.

import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
import { CONTROL_BUTTON } from "@/components/controls";
import { useKeywordFlash } from "@/components/keyword-spotter";
import { VoiceCommandChip } from "@/components/voice-command-chip";

// The flash ring: applied on press via the `active:` variant (every button), and
// added directly while a badge's voice word is in the flashing set. The ring is a
// box-shadow, so it paints in DOM order — in a segmented row a later sibling would
// cover the ring's overlapping edge. z-10 (with relative for a stacking context)
// lifts the flashing button above its neighbours so the ring shows in full.
// Exported for the odd voice control that isn't a button (Goon's after-play
// checkboxes) so a voice hit looks the same everywhere.
export const RING =
  "relative z-10 ring-2 ring-foreground ring-offset-2 ring-offset-background";
export const ACTIVE_RING =
  "active:relative active:z-10 active:ring-2 active:ring-foreground active:ring-offset-2 active:ring-offset-background";

export function Button({
  voiceCommand,
  flash = true,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { voiceCommand?: string; flash?: boolean }) {
  const flashing = useKeywordFlash();
  // Some controls carry their own "activated" signal (the tabs restyle the
  // selected tab), so they opt out of the press/voice flash with flash={false}.
  const activeRing = flash ? ACTIVE_RING : "";

  if (voiceCommand === undefined) {
    return (
      <button
        {...props}
        className={twMerge(CONTROL_BUTTON, activeRing, className)}
      >
        {children}
      </button>
    );
  }

  // The voice flash merges AFTER className so a custom look never disables it.
  const voiceFlash = flash && flashing.has(voiceCommand) ? RING : "";
  return (
    <button
      {...props}
      className={twMerge(
        `relative ${CONTROL_BUTTON}`,
        activeRing,
        className,
        voiceFlash,
      )}
    >
      {children}
      <VoiceCommandChip
        word={voiceCommand}
        className="absolute top-2 right-2"
      />
    </button>
  );
}
