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
//
// The hits are preceded by what to do with them, because this is where a model
// stops: with a page of captions in front of it, describing one reads as having
// shown it. MEDIA_SECTION states the same rule, thousands of characters earlier
// in the prompt; this is the copy that sits where the decision is made, so keep
// it to the two sentences and leave the reasoning there.
const PICK_ONE =
  'Pick one and call send_media with its ref — nothing has been shown to him ' +
  'yet. These refs keep working, so you can send another from this list later ' +
  'without searching again.';

export function describeHits(hits: readonly MediaHit[]): string {
  if (hits.length === 0) {
    return 'Nothing in your pictures or videos matches that — try describing something else.';
  }
  const lines = hits.map((h) => `${h.ref} — (${nameKind(h)}) ${h.caption}`);
  return `${PICK_ONE}\n\n${lines.join('\n')}`;
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
