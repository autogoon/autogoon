"use client";

// The one card component the panels are built from — a titled section, and
// every variant the app's cards need, so the internals (title row, muted
// body, icon/chevron placement) are styled in exactly one place:
//
// - Plain (default): heading then stacked content, whitespace-separated.
// - `bordered`: a rounded, padded neutral box (debug/log panels).
// - `accent`: the chooser/list card — accent-coloured border with a diagonal
//   gradient tint, interpolated from the colour name (safelisted across the
//   palette in globals.css); `dashed` is the plain placeholder variant
//   (incompatible packs).
// - `onClick` makes a card clickable: pointer cursor, hover tint deepen, the
//   press flash ring, and the right-edge chevron. `button` renders a real
//   <button> (only for cards with no interactive children); everything else
//   is a div — the app doesn't do keyboard, so a clickable div is fine.
// - `voiceCommand` is the card's spoken word: shows the corner chip and
//   flashes the ring when the recognizer hears it — same look as a press,
//   and fully independent of clickability.
// - `title` (any node) sits top-left. `action` (controls — selects, a Remove
//   button) floats top-right with the voice chip to its right: a float, so a
//   tall control never stretches the title line but the card still grows to
//   contain it, and text wraps around it. The cluster swallows its clicks so
//   adjusting a control never triggers the card.
//
// The interior is spans-only so the same markup is legal inside <button> and
// <div> alike — one render path, no drift between the two.

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { ACTIVE_RING, RING } from "@/components/button";
import { useKeywordFlash } from "@/components/keyword-spotter";
import { VoiceCommandChip } from "@/components/voice-command-chip";

export function Card({
  title,
  action,
  icon,
  accent = null,
  dashed = false,
  button = false,
  voiceCommand,
  onClick,
  className,
  bordered = false,
  children,
}: {
  title?: ReactNode;
  // Controls floated in the top-right corner, left of the voice chip.
  action?: ReactNode;
  // The card's icon, left of the content; the card owns its size, the caller
  // its colour.
  icon?: ReactNode;
  // Accent colour name (e.g. "fuchsia"); null/omitted = no tint.
  accent?: string | null;
  dashed?: boolean;
  button?: boolean;
  voiceCommand?: string;
  onClick?: () => void;
  className?: string;
  bordered?: boolean;
  children: ReactNode;
}) {
  const flashing = useKeywordFlash();
  const clickable = onClick !== undefined;
  // className OVERRIDES the shell per utility (tailwind-merge), same as
  // Button — callers state differences, not the whole look.
  const shell = twMerge(
    [
      accent !== null || dashed
        ? "rounded-xl border px-4 py-2 pb-3"
        : bordered
          ? "rounded-lg border border-foreground/15 bg-foreground/5 p-4"
          : "",
      dashed ? "border-foreground/40 border-dashed" : "",
      accent !== null
        ? `border-${accent}-500 bg-linear-to-br from-${accent}-500/15 to-${accent}-500/5`
        : "",
      accent !== null && clickable
        ? `hover:from-${accent}-500/25 hover:to-${accent}-500/10`
        : "",
      clickable ? `cursor-pointer ${ACTIVE_RING}` : "",
      button ? "text-left" : "",
      className ?? "",
      // The voice flash merges last so a custom look never disables it.
      voiceCommand !== undefined && flashing.has(voiceCommand) ? RING : "",
    ]
      .filter((c) => c !== "")
      .join(" "),
  );

  // The top-right cluster: controls first, the voice chip rightmost. Floated
  // (not absolute) so it never stretches the title line, yet the card still
  // grows to contain a tall control — the flow-root wrapper in `core` makes
  // the float count toward the card's height, and text wraps around it.
  const corner = (action !== undefined || voiceCommand !== undefined) && (
    <span
      className="float-right mb-1 ml-4 flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {action}
      {voiceCommand !== undefined && <VoiceCommandChip word={voiceCommand} />}
    </span>
  );

  const core = (
    <span className="flow-root">
      {corner}
      {title !== undefined && (
        <span className="text-foreground mb-1 block text-xl font-semibold">
          {title}
        </span>
      )}
      <span className="text-muted-foreground block space-y-2">{children}</span>
    </span>
  );

  const content =
    icon !== undefined || clickable ? (
      <span className="flex items-center gap-4">
        {icon !== undefined && (
          <span className="shrink-0 self-start *:size-8">{icon}</span>
        )}
        <span className="min-w-0 flex-1">{core}</span>
        {clickable && (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        )}
      </span>
    ) : (
      core
    );

  if (button) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {content}
      </button>
    );
  }
  return (
    <div onClick={onClick} className={shell}>
      {content}
    </div>
  );
}
