'use client';

// One companion's card on the setup chooser — clickable, edge to edge, in the
// selected variant's colour. The pack pickers (base version and overlay) ride
// in the card's action slot; the card previews exactly what the selection
// plays: description, accent and the feature line all follow the selects
// (overlay wins, then base version, then the companion's own).

import { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/card';
import {
  describeMedia,
  effectiveMedia,
  overlayNeedsZone,
  type LibraryEntry,
  type MediaCount,
  type PackOption,
  type VariantSlot,
} from '@/lib/goonpacks/entries';

// The remembered per-companion variant selection lives under this key.
export const SELECTED_VARIANT_PREFIX = 'goonpacks:last-variant:';

// A card's remembered picks — base version and overlay, stored together.
export type PackSel = { base: string | null; overlay: string | null };

// The card's feature line: what the selected base+overlay pair actually plays
// with — the media it brings whenever there is any (bold when the overlay
// supplies or strips it), plus each slot the overlay changes.
function variantFeatures(v: {
  media: MediaCount;
  changed: VariantSlot[];
}): { text: string; bold: boolean }[] {
  const changed = v.changed;
  const out: { text: string; bold: boolean }[] = [];
  const media = describeMedia(v.media);
  if (media !== '') {
    out.push({ text: media, bold: changed.includes('media') });
  } else if (changed.includes('media')) {
    out.push({ text: 'no media', bold: true }); // noMedia strips them
  }
  for (const slot of changed) {
    if (slot === 'media') continue;
    out.push({ text: slot, bold: true });
  }
  return out;
}

// One trait as five pips, filled to its value. Pips rather than a number
// because the point is comparing one companion against the others at a glance —
// you read "more talkative than Miley" off the shape without doing arithmetic —
// and because 1–5 is a scale of appetite, not a measurement anyone needs
// exactly. Pips wear the companion's accent, so a card stays one colour.
function TraitPips({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`size-1.5 rounded-full ${
              n <= value ? `bg-${accent}-500` : 'bg-foreground/20'
            }`}
          />
        ))}
      </span>
    </span>
  );
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
  // An overlay the selected base leaves without a zone is refused the same way
  // a missing one is: it cannot be picked (the option is disabled), so it
  // cannot be shown as picked either — including one remembered from when a
  // different base was selected.
  const refused = (o: PackOption): boolean => overlayNeedsZone(o, baseOpt);
  const overlayOpt =
    entry.overlays.find(
      (o) => o.key !== null && o.key === sel?.overlay && !refused(o),
    ) ?? null;
  const accent = overlayOpt?.accent ?? baseOpt.accent ?? c.accentColour;
  const description =
    overlayOpt?.description ?? baseOpt.description ?? c.description;
  const features = variantFeatures({
    media: effectiveMedia(overlayOpt, baseOpt.media),
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
                  value={baseOpt.key ?? 'default'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const key =
                      e.target.value === 'default' ? null : e.target.value;
                    // The selected overlay rides across a base switch, unless
                    // the base being switched to is one that refuses it — so a
                    // refused pairing is never what gets stored.
                    const next = entry.bases.find((b) => b.key === key);
                    const carried =
                      overlayOpt !== null &&
                      next !== undefined &&
                      !overlayNeedsZone(overlayOpt, next)
                        ? overlayOpt.key
                        : null;
                    onSelectPacks(c.id, { base: key, overlay: carried });
                  }}
                  className={`text-foreground border-${accent}-500 bg-background appearance-none rounded-lg border py-1 pr-7 pl-2 text-sm`}
                >
                  {entry.bases.map((b) => (
                    <option key={b.key ?? 'default'} value={b.key ?? 'default'}>
                      {b.label}
                      {b.version !== undefined ? ` ${b.version}` : ''}
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
                  value={overlayOpt?.key ?? 'default'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    onSelectPacks(c.id, {
                      base: baseOpt.key,
                      overlay:
                        e.target.value === 'default' ? null : e.target.value,
                    })
                  }
                  className={`text-foreground border-${accent}-500 bg-background appearance-none rounded-lg border py-1 pr-7 pl-2 text-sm`}
                >
                  <option value="default">default</option>
                  {entry.overlays.map((o) => (
                    <option
                      key={o.key}
                      value={o.key ?? 'default'}
                      disabled={refused(o)}
                    >
                      {o.label}
                      {o.version !== undefined ? ` ${o.version}` : ''}
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
              {i > 0 ? ' · ' : ''}
              {f.bold ? (
                <span className="text-foreground font-medium">{f.text}</span>
              ) : (
                f.text
              )}
            </Fragment>
          ))}
        </span>
      )}
      {/* Disposition, kept off the feature line above: that line says what the
          selected packs bring, this says what the companion is like. */}
      <span className="mt-1.5 flex gap-4 text-sm">
        <TraitPips label="chatty" value={c.chattiness} accent={accent} />
        <TraitPips label="playful" value={c.playfulness} accent={accent} />
      </span>
    </Card>
  );
}
