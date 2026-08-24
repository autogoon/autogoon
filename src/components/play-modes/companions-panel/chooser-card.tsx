// One companion's card on the setup chooser — clickable, edge to edge, in the
// selected variant's colour. The pack pickers (base version and overlay) ride
// in the card's action slot; the card previews exactly what the selection
// plays: description, accent and the feature line all follow the selects
// (overlay wins, then base version, then the companion's own).

import { Fragment } from 'react';
import { ChevronDown, HardDrive } from 'lucide-react';
import { Card } from '@/components/card';
import {
  describeMedia,
  effectiveMedia,
  mediaSource,
  overlayNeedsZone,
  type LibraryEntry,
  type MediaCount,
  type PackOption,
  type VariantSlot,
} from '@/lib/goonpacks/entries';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

// The remembered per-companion variant selection lives under this key.
export const SELECTED_VARIANT_PREFIX = 'goonpacks:last-variant:';

// Radix reserves the empty string, so "no overlay" needs a value of its own.
const DEFAULT = 'default';

// Playing the base with no overlay, as a row in the overlay picker — the one
// option with no pack behind it, so it carries a description of its own rather
// than a manifest's.
const NO_OVERLAY: PackOption = {
  key: null,
  label: DEFAULT,
  aboutThePack: 'The companion as their pack ships them.',
  media: { images: 0, videos: 0 },
  changed: [],
};

// What names an option: the whole id where a pack is behind it, since two
// overlays from one publisher are told apart by the half `label` drops.
const optionName = (o: PackOption): string =>
  `${o.id ?? o.label}${o.version === undefined ? '' : ` ${o.version}`}`;

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
  disk,
}: {
  entry: LibraryEntry;
  sel: PackSel | undefined;
  onSelectPacks: (companionId: string, sel: PackSel) => void;
  // The pack sources being read off disk: which keys came from one and where
  // from, the experiments any of them can be played with, and which each is
  // being played with — undefined meaning the stock sidecars. All empty
  // off a dev server, where nothing is read off disk. The card looks its own
  // selection up, since which base and overlay are selected is its own.
  disk: {
    dirs: ReadonlyMap<string, string>;
    experiments: readonly string[];
    chosen: (dir: string) => string | undefined;
    onChoose: (dir: string, experiment: string | undefined) => void;
  };
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
  // What this pairing was written against, if its author said. Advisory: the
  // model every companion runs on is the one in Settings, so this is shown and
  // never applied.
  const recommendedModel =
    overlayOpt?.recommendedModel ??
    baseOpt.recommendedModel ??
    c.recommendedModel;
  const features = variantFeatures({
    media: effectiveMedia(overlayOpt, baseOpt),
    changed: overlayOpt?.changed ?? [],
  });
  // The directory an experiment choice would apply to. A pairing can stack two
  // sources on disk, but only one of them supplies the media — the overlay
  // decides which (mediaSource) — and the descriptions are read out of that
  // one. Undefined where the media comes out of storage, where the overlay
  // strips it, and on any build that reads nothing off disk.
  const mediaOpt = mediaSource(overlayOpt, baseOpt);
  const diskDir =
    mediaOpt === null || mediaOpt.key === null
      ? undefined
      : disk.dirs.get(mediaOpt.key);
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
              {/* Not a native select: two overlays from one publisher at one
                  version read identically as <option> text, and what tells them
                  apart is the description, which an option can't hold. */}
              <Select
                value={overlayOpt?.key ?? DEFAULT}
                onValueChange={(picked) =>
                  onSelectPacks(c.id, {
                    base: baseOpt.key,
                    overlay: picked === DEFAULT ? null : picked,
                  })
                }
              >
                {/* The id alone, not SelectValue: Radix puts the selected
                    item's own content in the trigger, and that content is two
                    lines deep here. */}
                <SelectTrigger
                  size="sm"
                  aria-label={`${c.name} overlay`}
                  className={`border-${accent}-500 text-foreground`}
                >
                  {optionName(overlayOpt ?? NO_OVERLAY)}
                </SelectTrigger>
                <SelectContent className="max-w-96">
                  {[NO_OVERLAY, ...entry.overlays].map((o) => (
                    <SelectItem
                      key={o.key ?? DEFAULT}
                      value={o.key ?? DEFAULT}
                      disabled={refused(o)}
                    >
                      <span className="flex min-w-0 flex-col items-start">
                        <span>{optionName(o)}</span>
                        {o.aboutThePack !== undefined && (
                          <span className="text-muted-foreground text-xs whitespace-normal">
                            {o.aboutThePack}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {diskDir !== undefined && (
            // Whose descriptions the media is read with. Every item's caption
            // and long description comes from here, so it decides what she can
            // be asked for as well as how much she has — an experiment that
            // never described an item leaves that item out of the set
            // entirely. "Stock" is the plain `<stem>.md` beside each item —
            // whatever wrote it, `goonpack:describe` or an author — and is what
            // a pack built without naming an experiment ships.
            <label
              className="text-muted-foreground flex items-center gap-1.5 text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <HardDrive
                className="size-3.5"
                aria-label={`${c.name} plays a pack source on this machine`}
              />
              <span className="relative">
                <select
                  aria-label={`${c.name} descriptions`}
                  value={disk.chosen(diskDir) ?? 'default'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    disk.onChoose(
                      diskDir,
                      e.target.value === 'default' ? undefined : e.target.value,
                    )
                  }
                  className={`text-foreground border-${accent}-500 bg-background appearance-none rounded-lg border py-1 pr-7 pl-2 text-sm`}
                >
                  <option value="default">Stock</option>
                  {disk.experiments.map((id) => (
                    <option key={id} value={id}>
                      {id}
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
      {recommendedModel !== undefined && (
        <span className="text-muted-foreground mt-1 block text-sm">
          Written for <span className="font-mono">{recommendedModel}</span>
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
