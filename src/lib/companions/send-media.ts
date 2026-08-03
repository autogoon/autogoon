// The two media tools' decisions, split from the panel that declares them: how
// a search result reads to the model, which item a ref means, and when to
// refuse. The panel keeps the tools' schemas and the one side effect — putting
// the item on his screen.
import type { CompanionMedia } from './companions';
import type { MediaHit } from './media-search';
import type { ToolRunResult } from './tools';

const nameKind = (m: { kind: CompanionMedia['kind'] }): string =>
  m.kind === 'video' ? 'video' : 'picture';

// A search result as the model reads it: one line per hit, each opening with
// the ref that sends it. Nothing matching is an answer in itself — far better
// than them announcing a picture that never came.
export function describeHits(hits: readonly MediaHit[]): string {
  if (hits.length === 0) {
    return 'Nothing in your pictures or videos matches that — try describing something else.';
  }
  return hits.map((h) => `${h.ref} — (${nameKind(h)}) ${h.caption}`).join('\n');
}

// The same search as the transcript shows it. The model has to read every hit
// to choose between them; on screen that is a page of captions nobody reads,
// where the only question is whether the search found anything.
export function countHits(hits: readonly MediaHit[]): string {
  return hits.length === 1 ? '1 match' : `${hits.length} matches`;
}

// Either the item to show and what to tell the model it sent, or — with
// nothing shown — the sentence saying why.
export type MediaPick =
  { show: CompanionMedia; sent: ToolRunResult } | { show: null; sent: string };

// `items` is the companion's whole set; the ref came from a search over it. A
// ref that doesn't resolve is refused rather than clamped to something: a ref
// is either theirs or invented.
export function pickMedia(
  items: readonly CompanionMedia[],
  args: Record<string, unknown>,
): MediaPick {
  const ref = args.ref;
  if (typeof ref !== 'string' || ref === '') {
    return {
      show: null,
      sent: 'No ref was given — call search_media first and send one of the refs it returns.',
    };
  }
  const item = items.find((m) => m.ref === ref);
  if (item === undefined) {
    return {
      show: null,
      sent: `${ref} isn't one of yours — call search_media and send one of the refs it returns.`,
    };
  }
  return {
    show: item,
    sent: {
      // The description as well as the caption, because this is the one moment
      // the companion needs to know the picture rather than recognise it: it is
      // on his screen and she has to talk about what is in it. A search hit
      // carries the caption alone — enough to choose between twenty-five — and
      // the long text arrives only for the one she sent.
      result: `Sent him the ${nameKind(item)}: ${item.caption}\n\n${item.description}`,
      mediaRef: item.ref,
    },
  };
}
