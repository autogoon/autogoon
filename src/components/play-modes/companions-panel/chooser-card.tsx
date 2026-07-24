"use client";

// One companion's card on the setup chooser — clickable, edge to edge, in the
// selected variant's colour. The pack pickers (base version and overlay) ride
// in the card's action slot; the card previews exactly what the selection
// plays: description, accent and the feature line all follow the selects
// (overlay wins, then base version, then the companion's own).

import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/card";
import {
  effectivePictures,
  type LibraryEntry,
  type VariantSlot,
} from "@/lib/goonpacks/entries";

// The remembered per-companion variant selection lives under this key.
export const SELECTED_VARIANT_PREFIX = "goonpacks:last-variant:";

// A card's remembered picks — base version and overlay, stored together.
export type PackSel = { base: string | null; overlay: string | null };

// The card's feature line: what the selected base+overlay pair actually plays
// with — the picture count whenever there are any (bold when the overlay
// supplies or strips them), plus each slot the overlay changes.
function variantFeatures(v: {
  pictures: number;
  changed: VariantSlot[];
}): { text: string; bold: boolean }[] {
  const changed = v.changed;
  const out: { text: string; bold: boolean }[] = [];
  const pictures = v.pictures;
  if (pictures > 0) {
    out.push({
      text: `${pictures} picture${pictures === 1 ? "" : "s"}`,
      bold: changed.includes("pictures"),
    });
  } else if (changed.includes("pictures")) {
    out.push({ text: "no pictures", bold: true }); // noPictures strips them
  }
  for (const slot of changed) {
    if (slot === "pictures") continue;
    out.push({ text: slot, bold: true });
  }
  return out;
}

export function ChooserCard({
  entry,
  sel,
  onSelectPacks,
  onPick,
}: {
  entry: LibraryEntry;
  sel: PackSel | undefined;
  onSelectPacks: (companionId: string, sel: PackSel) => void;
  // Fired with the selected base/overlay keys when the card is clicked.
  onPick: (
    entry: LibraryEntry,
    baseKey: string | null,
    overlayKey: string | null,
  ) => void;
}) {
  const c = entry.companion;
  // The remembered base/overlay picks, falling back — newest base, no
  // overlay — when a remembered pack is gone (removed or now incompatible).
  const baseOpt =
    entry.bases.find((b) => b.key === (sel?.base ?? null)) ?? entry.bases[0]!;
  const overlayOpt =
    entry.overlays.find((o) => o.key !== null && o.key === sel?.overlay) ??
    null;
  const accent = overlayOpt?.accent ?? baseOpt.accent ?? c.accentColour;
  const description =
    overlayOpt?.description ?? baseOpt.description ?? c.description;
  const features = variantFeatures({
    pictures: effectivePictures(overlayOpt, baseOpt.pictures),
    changed: overlayOpt?.changed ?? [],
  });
  return (
    <Card
      accent={accent}
      onClick={() => onPick(entry, baseOpt.key, overlayOpt?.key ?? null)}
      title={c.name}
      action={
        <>
          {entry.bases.length > 1 && (
            <label
              className="text-muted-foreground flex items-center gap-1.5 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              Base:
              <span className="relative">
                <select
                  aria-label={`${c.name} version`}
                  value={baseOpt.key ?? "default"}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    onSelectPacks(c.id, {
                      base:
                        e.target.value === "default" ? null : e.target.value,
                      overlay: overlayOpt?.key ?? null,
                    })
                  }
                  className={`text-foreground border-${accent}-500 bg-background appearance-none rounded-lg border py-1 pr-7 pl-2 text-sm`}
                >
                  {entry.bases.map((b) => (
                    <option key={b.key ?? "default"} value={b.key ?? "default"}>
                      {b.label}
                      {b.version !== undefined ? ` ${b.version}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
              </span>
            </label>
          )}
          {entry.overlays.length > 0 && (
            <label
              className="text-muted-foreground flex items-center gap-1.5 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              Overlay:
              <span className="relative">
                <select
                  aria-label={`${c.name} overlay`}
                  value={overlayOpt?.key ?? "default"}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    onSelectPacks(c.id, {
                      base: baseOpt.key,
                      overlay:
                        e.target.value === "default" ? null : e.target.value,
                    })
                  }
                  className={`text-foreground border-${accent}-500 bg-background appearance-none rounded-lg border py-1 pr-7 pl-2 text-sm`}
                >
                  <option value="default">default</option>
                  {entry.overlays.map((o) => (
                    <option key={o.key} value={o.key ?? "default"}>
                      {o.label}
                      {o.version !== undefined ? ` ${o.version}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
              </span>
            </label>
          )}
        </>
      }
    >
      <span className="block">{description}</span>
      {features.length > 0 && (
        <span className="mt-1 block text-sm">
          {features.map((f, i) => (
            <Fragment key={f.text}>
              {i > 0 ? " · " : ""}
              {f.bold ? (
                <span className="text-foreground font-medium">{f.text}</span>
              ) : (
                f.text
              )}
            </Fragment>
          ))}
        </span>
      )}
    </Card>
  );
}
