// The send_media tool's decisions, split from the panel that declares it: the
// numbered list the model chooses from, which item a choice means, and when to
// refuse the call. The panel keeps the tool's schema and the one side effect —
// putting the item on his screen.
import type { CompanionMedia } from './companions';
import type { ToolRunResult } from './tools';

const nameKind = (m: CompanionMedia): string =>
  m.kind === 'video' ? 'video' : 'picture';

// What the model reads to choose, one line per item. The numbering is 1-based
// and is the one pickMedia counts in — they live together so they cannot drift.
export function describeMediaList(items: readonly CompanionMedia[]): string {
  return items
    .map((m, i) => `${i + 1} — (${nameKind(m)}) ${m.caption}`)
    .join('\n');
}

// Either the item to show and what to tell the model it sent, or — with
// nothing shown — the sentence saying why.
export type MediaPick =
  { show: CompanionMedia; sent: ToolRunResult } | { show: null; sent: string };

// `items` is the companion's media, in the order describeMediaList numbered.
// The panel only offers the tool when there is some, so there is always an item
// to land on.
export function pickMedia(
  items: readonly CompanionMedia[],
  args: Record<string, unknown>,
): MediaPick {
  const n = args.which;
  // A number outside the list is a real choice badly expressed, so it clamps.
  // Something that isn't a number carries no choice at all, and the first item
  // stands in rather than the call failing.
  const idx =
    typeof n === 'number' && Number.isFinite(n)
      ? Math.min(Math.max(Math.round(n), 1), items.length) - 1
      : 0;
  const item = items[idx]!;
  const named = nameKind(item);
  // `kind` is a stated intent, not a filter — the list is one numbering over
  // everything. Refusing a mismatch turns a misread number into a correction
  // the companion can act on, rather than the wrong thing arriving on his
  // screen.
  const wanted = args.kind;
  if (typeof wanted === 'string' && wanted !== named) {
    return {
      show: null,
      sent: `number ${idx + 1} is a ${named}, not a ${wanted} — check the list and pick again`,
    };
  }
  return {
    show: item,
    sent: {
      result: `Sent him the ${named}: ${item.caption}`,
      mediaRef: item.ref,
    },
  };
}
