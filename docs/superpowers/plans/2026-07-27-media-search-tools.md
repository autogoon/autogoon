# Search and send by ref — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A companion asks for a picture in words, gets back a bounded set of
matches, and sends one by ref — with the numbered list gone from the prompt and
the set summary in its place.

**Architecture:** A pure search module scores a query against the captions and
long descriptions already on each item, and the panel declares two tools over
it. `search_media` returns refs and captions; `send_media` resolves a ref. The
ref is the one that already exists — `goonpack:<key>/<stem>`, built in
`library.ts` and persisted on a thread turn as `mediaRef` — so a historical call
stops denoting a different picture when a pack version or overlay changes the
set. The search itself is deliberately simple and deliberately replaceable.

**Tech Stack:** TypeScript, React, Jest (unit, colocated).

This is steps 4 and 5 of
[the media search design](../specs/2026-07-27-media-search-design.md), which
land together. It depends on
[two texts and a summary](./2026-07-27-pack-two-texts-and-summary.md) having
landed: every type it consumes is produced there.

## Global Constraints

- **Change files with Edit and Write only** — never `sed -i`, a heredoc, or a
  redirect into a tracked path.
- **Zero warnings**: `npm run lint` runs with `--max-warnings 0`.
- **Gates before the PR**: `npm run typecheck`, `npm run lint`,
  `npm run format`, `npm test`, `npm run test:e2e`.
- **Never fake the LLM.** The search is a pure function over text the pack
  already carries, so it is unit-testable directly. Anything needing the model
  is exercised by driving the app, not by a stub.
- **The prompt prefix stays reusable.** The summary is per-pack and fills at
  load, in `fillSharedSections`, alongside the other shared sections — never per
  turn. A value that changes per turn rides `liveStateMessage`; this one does
  not change per turn.
- **CHANGELOG.md is part of the work**, not a follow-up.

## Why the search is this simple

The spec is explicit that the first implementation exists to make the tools work
end to end, not to be good, and that which retrieval method wins belongs to
[roadmap/INFERENCE-LIBRARY.md](../../../roadmap/INFERENCE-LIBRARY.md), decided
against a yardstick that does not exist yet.

Lexical scoring over the two texts is what that argues for: it is deterministic,
it runs in microseconds, it needs no key and no network, and — the reason that
matters most here — it is a pure function, so its behaviour can be pinned by
unit tests instead of by faking a model. Replacing it later touches one module
and no tool contract.

## What the return shape must not foreclose

The spec names four levers for the same-N-every-time problem — excluding what
has been sent, near-duplicate collapse, a cursor, and sampling above a threshold
— and chooses none of them. What is decided here is only the shape that leaves
all four open:

- `searchMedia` returns an **object**, not a bare array, so a cursor or a "there
  are more" signal can be added without changing its callers' shape.
- It takes an **`exclude` set**, used from the first commit for what has already
  been sent this session, which is the cheapest of the four and the one the
  session already knows.
- Its ordering is **deterministic and documented as such**, so a later sampling
  lever is a visible change of contract rather than a silent one.

## File Structure

| File                                                   | Responsibility                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/companions/media-search.ts`                   | New. Score a request against a companion's media and return the best few. |
| `src/lib/companions/media-search.test.ts`              | New. Ranking, exclusion, the empty result, determinism.                   |
| `src/lib/companions/send-media.ts`                     | Resolve a ref to an item, or say why not. No numbered list.               |
| `src/lib/companions/send-media.test.ts`                | New. Ref resolution and refusal.                                          |
| `src/components/play-modes/companions-panel/index.tsx` | Declares both tools and holds the session's sent-set.                     |
| `src/lib/companions/shared-prompt.ts`                  | `MEDIA_SECTION` describes two tools and carries the summary.              |
| `src/lib/goonpacks/prompt.ts`                          | Fills the summary into the media section at load.                         |
| `src/lib/goonpacks/resolve.ts`                         | Passes the summary through to the fill.                                   |
| `modes/COMPANIONS.md`, `GOONPACKS.md`                  | Describe asking-and-searching rather than picking from a list.            |
| `CHANGELOG.md`                                         | One `feature` entry.                                                      |

---

### Task 1: The search

**Files:**

- Create: `src/lib/companions/media-search.ts`
- Create: `src/lib/companions/media-search.test.ts`

**Interfaces:**

- Consumes: `CompanionMedia` from `src/lib/companions/companions.ts`, which
  carries `ref`, `caption` and `description` (the long prose) after
  [the previous plan](./2026-07-27-pack-two-texts-and-summary.md).
- Produces:

```ts
export type MediaHit = { ref: string; caption: string; kind: MediaKind };
export type MediaSearchResult = { hits: MediaHit[] };
export const SEARCH_LIMIT = 25;
export function searchMedia(
  items: readonly CompanionMedia[],
  query: string,
  opts?: { limit?: number; exclude?: ReadonlySet<string> },
): MediaSearchResult;
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/companions/media-search.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import type { CompanionMedia } from './companions';
import { searchMedia } from './media-search';

const item = (
  ref: string,
  caption: string,
  description = '',
): CompanionMedia => ({
  kind: 'image',
  caption,
  description,
  ref,
  load: () => Promise.resolve(''),
  forget: () => {},
});

const set = [
  item('a', 'A woman kneeling on a bed, looking up.'),
  item('b', 'A woman standing on a beach at sunset.'),
  item('c', 'A woman sitting in a car.', 'There is a mirror behind her.'),
];

describe('searchMedia', () => {
  it('ranks the item whose caption shares most with the request first', () => {
    expect(searchMedia(set, 'kneeling looking up').hits[0]?.ref).toBe('a');
  });

  it('finds an item on detail that only its long description carries', () => {
    expect(searchMedia(set, 'mirror').hits[0]?.ref).toBe('c');
  });

  it('returns nothing when no item shares anything with the request', () => {
    expect(searchMedia(set, 'helicopter').hits).toEqual([]);
  });

  it('leaves out the items it was told to exclude', () => {
    const hits = searchMedia(set, 'woman', {
      exclude: new Set(['a', 'b']),
    }).hits;
    expect(hits.map((h) => h.ref)).toEqual(['c']);
  });

  it('returns at most the limit it was given', () => {
    expect(searchMedia(set, 'woman', { limit: 2 }).hits).toHaveLength(2);
  });

  it('orders equally-scoring items the same way every time', () => {
    const once = searchMedia(set, 'woman').hits.map((h) => h.ref);
    const twice = searchMedia(set, 'woman').hits.map((h) => h.ref);
    expect(once).toEqual(twice);
  });

  it('carries the caption and kind of each hit, which is what the model reads', () => {
    const hit = searchMedia(set, 'beach').hits[0];
    expect(hit?.caption).toBe('A woman standing on a beach at sunset.');
    expect(hit?.kind).toBe('image');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/companions/media-search.test.ts`

Expected: FAIL — `Cannot find module './media-search'`.

- [ ] **Step 3: Write the module**

Create `src/lib/companions/media-search.ts`:

```ts
// Finding one item in a companion's media from a request in their own words.
// Lexical overlap over the two texts each item carries: deliberately simple,
// deliberately replaceable, and pure — so it is pinned by tests rather than by
// faking a model. Which retrieval method actually wins is measured against a
// yardstick that doesn't exist yet (roadmap/INFERENCE-LIBRARY.md); the tool
// contract above it doesn't change when the answer arrives.
import type { MediaKind } from '@/lib/goonpacks/media';
import type { CompanionMedia } from './companions';

export type MediaHit = { ref: string; caption: string; kind: MediaKind };

// An object rather than a bare array: the session-scoping levers the roadmap
// weighs — a cursor, a "there are more" count — land here without changing what
// callers destructure.
export type MediaSearchResult = { hits: MediaHit[] };

// How many matches a search hands back. Big enough that a topic yields a set to
// send from over several turns, small enough to stay cheap in context.
export const SEARCH_LIMIT = 25;

// Words carrying no discriminating power in a request phrased as a sentence.
const STOP = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'he',
  'her',
  'him',
  'his',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'she',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'with',
  'you',
  'your',
]);

const terms = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

// A caption is the item's own summary of itself, so a hit there says more than
// one buried in a long description.
const CAPTION_WEIGHT = 2;

export function searchMedia(
  items: readonly CompanionMedia[],
  query: string,
  opts: { limit?: number; exclude?: ReadonlySet<string> } = {},
): MediaSearchResult {
  const wanted = new Set(terms(query));
  if (wanted.size === 0) return { hits: [] };
  const limit = opts.limit ?? SEARCH_LIMIT;

  const scored: { item: CompanionMedia; score: number }[] = [];
  for (const item of items) {
    if (opts.exclude?.has(item.ref) === true) continue;
    const caption = new Set(terms(item.caption));
    const long = new Set(terms(item.description));
    let score = 0;
    for (const w of wanted) {
      if (caption.has(w)) score += CAPTION_WEIGHT;
      else if (long.has(w)) score += 1;
    }
    if (score > 0) scored.push({ item, score });
  }

  // Ties break on ref so the same request twice gives the same answer. That is
  // a contract a sampling lever would deliberately break, not an accident.
  scored.sort(
    (a, b) => b.score - a.score || a.item.ref.localeCompare(b.item.ref),
  );

  return {
    hits: scored.slice(0, limit).map(({ item }) => ({
      ref: item.ref,
      caption: item.caption,
      kind: item.kind,
    })),
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/lib/companions/media-search.test.ts`

Expected: PASS.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add src/lib/companions/media-search.ts src/lib/companions/media-search.test.ts
git commit -m "Media search: score a request against the two texts each item carries"
```

---

### Task 2: Sending by ref

**Files:**

- Modify: `src/lib/companions/send-media.ts` — replace the whole module
- Create: `src/lib/companions/send-media.test.ts`

**Interfaces:**

- Consumes: `CompanionMedia`, `ToolRunResult`.
- Produces:

```ts
export type MediaPick =
  { show: CompanionMedia; sent: ToolRunResult } | { show: null; sent: string };
export function pickMedia(
  items: readonly CompanionMedia[],
  args: Record<string, unknown>,
): MediaPick;
export function describeHits(result: MediaSearchResult): string;
```

`describeMediaList` is deleted — nothing lists every item any more.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/companions/send-media.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import type { CompanionMedia } from './companions';
import { describeHits, pickMedia } from './send-media';

const item = (ref: string, caption: string): CompanionMedia => ({
  kind: 'image',
  caption,
  description: 'A long description.',
  ref,
  load: () => Promise.resolve(''),
  forget: () => {},
});

const set = [item('pack:x/a', 'On a bed.'), item('pack:x/b', 'On a beach.')];

describe('pickMedia', () => {
  it('shows the item whose ref was asked for and reports what went', () => {
    const pick = pickMedia(set, { ref: 'pack:x/b' });
    expect(pick.show?.ref).toBe('pack:x/b');
    expect(pick.sent).toEqual({
      result: 'Sent him the picture: On a beach.',
      mediaRef: 'pack:x/b',
    });
  });

  it('sends nothing for a ref that is not in the set, and says to search first', () => {
    const pick = pickMedia(set, { ref: 'pack:x/nope' });
    expect(pick.show).toBeNull();
    expect(pick.sent).toMatch(/search_media/);
  });

  it('sends nothing when the ref is missing rather than standing something in', () => {
    expect(pickMedia(set, {}).show).toBeNull();
  });
});

describe('describeHits', () => {
  it('gives one line per hit, each carrying the ref to send it by', () => {
    const text = describeHits({
      hits: [{ ref: 'pack:x/a', caption: 'On a bed.', kind: 'image' }],
    });
    expect(text).toContain('pack:x/a');
    expect(text).toContain('On a bed.');
  });

  it('says nothing matched rather than returning an empty list', () => {
    expect(describeHits({ hits: [] })).toMatch(/nothing/i);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/companions/send-media.test.ts`

Expected: FAIL — `describeHits` doesn't exist and `pickMedia` still reads
`args.which`.

- [ ] **Step 3: Rewrite the module**

Replace `src/lib/companions/send-media.ts` entirely:

```ts
// The two media tools' decisions, split from the panel that declares them: how
// a search result reads to the model, which item a ref means, and when to
// refuse. The panel keeps the tools' schemas and the one side effect — putting
// the item on his screen.
import type { CompanionMedia } from './companions';
import type { MediaSearchResult } from './media-search';
import type { ToolRunResult } from './tools';

const nameKind = (m: { kind: CompanionMedia['kind'] }): string =>
  m.kind === 'video' ? 'video' : 'picture';

// A search result as the model reads it: one line per hit, each opening with
// the ref that sends it. Nothing matching is an answer in itself — far better
// than them announcing a picture that never came.
export function describeHits(result: MediaSearchResult): string {
  if (result.hits.length === 0) {
    return 'Nothing in your pictures or videos matches that — try describing something else.';
  }
  return result.hits
    .map((h) => `${h.ref} — (${nameKind(h)}) ${h.caption}`)
    .join('\n');
}

// Either the item to show and what to tell the model it sent, or — with
// nothing shown — the sentence saying why.
export type MediaPick =
  { show: CompanionMedia; sent: ToolRunResult } | { show: null; sent: string };

// `items` is the companion's whole set; the ref came from a search over it.
// A ref that doesn't resolve is refused rather than clamped to something: with
// an index a wrong number still meant a picture, so standing one in was the
// kinder failure. A ref is either theirs or invented.
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
  const named = nameKind(item);
  return {
    show: item,
    sent: {
      result: `Sent him the ${named}: ${item.caption}`,
      mediaRef: item.ref,
    },
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/lib/companions/send-media.test.ts`

Expected: PASS. `npm test` will now fail elsewhere — the panel still calls
`describeMediaList`. Task 3 fixes that.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companions/send-media.ts src/lib/companions/send-media.test.ts
git commit -m "send_media: resolve a ref, and read a search result back"
```

---

### Task 3: The panel declares both tools

**Files:**

- Modify: `src/components/play-modes/companions-panel/index.tsx:238-361`

**Interfaces:**

- Consumes: `searchMedia`, `SEARCH_LIMIT`, `describeHits`, `pickMedia`.
- Produces: nothing importable.

- [ ] **Step 1: Hold what has already been sent**

Beside the lightbox state, add a ref holding the session's sent set. A ref, not
state: nothing renders from it, and the tool closures must read the current
value rather than the one captured at declaration.

```tsx
// What she's already sent this session, excluded from later searches so a
// second request on the same topic doesn't return the same picture. A ref
// because the tool closures outlive the render that made them.
const sentRefs = useRef<Set<string>>(new Set());
```

- [ ] **Step 2: Replace the media tool with two**

In the `tools` useMemo, replace the `send_media` block:

```tsx
      // The media tools — only when the companion has media. She asks in words,
      // the app searches, and she sends one of the refs it hands back.
      ...(items.length > 0
        ? [
            {
              name: 'search_media',
              description:
                'Look through your own pictures and videos for ones matching a description — "me on my knees looking up", "something on a beach". Returns up to a couple of dozen matches, each with a ref and what it shows. Call this before send_media; the refs it returns are what send_media takes.',
              parameters: {
                type: 'object',
                properties: {
                  description: {
                    type: 'string',
                    description: 'what you want a picture of, in your own words',
                  },
                },
                required: ['description'],
              },
              run: (args: Record<string, unknown>) => {
                const q = typeof args.description === 'string' ? args.description : '';
                return describeHits(
                  searchMedia(items, q, {
                    limit: SEARCH_LIMIT,
                    exclude: sentRefs.current,
                  }),
                );
              },
            } satisfies CompanionTool,
            {
              name: 'send_media',
              description:
                'Send him one of your pictures or videos, shown to him right now in the call. Pass `ref` — one of the refs search_media returned. Search first; a ref you made up sends nothing.',
              parameters: {
                type: 'object',
                properties: {
                  ref: {
                    type: 'string',
                    description: 'a ref from search_media',
                  },
                },
                required: ['ref'],
              },
              run: (args: Record<string, unknown>) => {
                const pick = pickMedia(items, args);
                if (pick.show !== null) {
                  sentRefs.current.add(pick.show.ref);
                  showMedia(pick.show);
                }
                return pick.sent;
              },
            } satisfies CompanionTool,
          ]
        : []),
```

Update the imports at the top of the file: `describeMediaList` goes,
`describeHits` and `pickMedia` come from `send-media`, `searchMedia` and
`SEARCH_LIMIT` from `media-search`.

- [ ] **Step 3: Clear the sent set when the thread clears**

The panel already takes `clearThread` from the voice session and wires it to a
button. Wrap it so starting the conversation over starts the exclusions over
too, and use the wrapper at the button:

```tsx
// Clearing the conversation clears what she's already sent with it: the
// exclusions belong to the thread, not to the panel's lifetime.
const clearThreadAndSent = useCallback(() => {
  sentRefs.current = new Set();
  clearThread();
}, [clearThread]);
```

- [ ] **Step 4: Run the tests**

Run: `npm test`

Expected: PASS. Anything still referencing `describeMediaList` is a real
finding.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add src/components/play-modes/companions-panel/index.tsx
git commit -m "Companions: search for a picture, then send it by ref"
```

---

### Task 4: The summary reaches the prompt

**Files:**

- Modify: `src/lib/companions/shared-prompt.ts:56-76`
- Modify: `src/lib/goonpacks/prompt.ts`
- Modify: `src/lib/goonpacks/resolve.ts:24-28`, and `applyOverlay`'s `fill` call
- Test: `src/lib/goonpacks/prompt.test.ts`, `src/lib/goonpacks/resolve.test.ts`

**Interfaces:**

- Consumes: `Companion.mediaSummary` from
  [the previous plan](./2026-07-27-pack-two-texts-and-summary.md).
- Produces:

```ts
export function mediaSection(summary: string): string;
export function fillSharedSections(
  prompt: string,
  opts: { mediaSummary?: string },
): string;
```

`MEDIA_SECTION` stops being a constant. `includeMedia` is replaced by the
presence of `mediaSummary` — one input instead of two that could disagree.

- [ ] **Step 1: Write the failing tests**

In `src/lib/goonpacks/prompt.test.ts`:

```ts
it('puts the set summary into the media section', () => {
  const filled = fillSharedSections('{{MEDIA_SECTION}}', {
    mediaSummary: 'Mostly beach shots, a few indoors.',
  });
  expect(filled).toContain('Mostly beach shots, a few indoors.');
});

it('leaves the media section out entirely for a companion with no media', () => {
  expect(fillSharedSections('{{MEDIA_SECTION}}', {})).not.toMatch(
    /search_media/,
  );
});

it('names both media tools, since one is useless without the other', () => {
  const filled = fillSharedSections('{{MEDIA_SECTION}}', {
    mediaSummary: 'A set.',
  });
  expect(filled).toContain('search_media');
  expect(filled).toContain('send_media');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/goonpacks/prompt.test.ts`

Expected: FAIL — `opts.mediaSummary` isn't read, and the section names neither
tool.

- [ ] **Step 3: Rewrite the media section**

In `src/lib/companions/shared-prompt.ts`, replace `MEDIA_SECTION` with a
function of the summary. Its comment says what changed about the shape: the
schema no longer lists what they have, so this block is where they learn it.

```ts
// The media ability, for a companion who can send pictures or videos of
// themselves. Shared and persona-neutral so any companion can opt in, and
// filled once at load with their pack's own summary of the set — the tool
// schemas no longer list what they have, so this is where they learn what
// there is to ask for. Starts with a header and ends with no trailing newline.
export const mediaSection = (summary: string): string =>
  `PICTURES AND VIDEOS:
- You can send him a picture or a short video of yourself, right there in the
  call. Here is what you have:

${summary}

- To send one, first call search_media with a description of what you want —
  "me on my knees looking up", "something on a beach". It hands back matches,
  each with a ref. Then call send_media with one of those refs.
- Sending it is calling the tool — saying "here, look at this" in words does
  nothing on its own. So when you want him to see you, USE THE TOOL.
- If nothing matches, you'll be told so. Ask for something else rather than
  talking about a picture that never arrived.
- Send one when it fits and feels natural — when he asks to see you, or when you
  want to show off for him — not constantly. You love showing him your body
  because you know how much he loves it, so lean into that when you do.`;
```

Leave the "you'll be told it sent, and THEN you say something about it" rule
out: with a search result in hand she has already read the caption of what she
chose. Whether that reads better or worse is
[an open question in the spec](../specs/2026-07-27-media-search-design.md) to
settle by driving the app, not by guessing here.

- [ ] **Step 4: Fill it**

In `src/lib/goonpacks/prompt.ts`, take `MEDIA_SECTION` out of `SECTIONS`, import
`mediaSection`, and change the signature:

```ts
export function fillSharedSections(
  prompt: string,
  opts: { mediaSummary?: string },
): string {
  const filled = prompt.replace(
    /\{\{([A-Z0-9_]+)\}\}/g,
    (token, name: string) => {
      // A companion with no media has no summary, and the section goes with it.
      if (name === 'MEDIA_SECTION') {
        return opts.mediaSummary === undefined ? '' : mediaSection(opts.mediaSummary);
      }
      return SECTIONS[name] ?? token;
    },
  );
```

- [ ] **Step 5: Pass it through**

In `src/lib/goonpacks/resolve.ts`:

```ts
function fill(prompt: string, mediaSummary: string | undefined) {
  return fillSharedSections(prompt, { mediaSummary });
}
```

Update both call sites — the as-is path and `applyOverlay` — to pass the summary
that goes with the media they resolved. In `applyOverlay` that is the
`mediaSummary` computed alongside `media`, not the base's.

- [ ] **Step 6: Run to verify they pass**

Run: `npm test`

Expected: PASS. `resolve.test.ts` has tests asserting `MEDIA_SECTION` is dropped
for a `noMedia` overlay — they still hold, since no summary means no section,
but their names may now describe the mechanism wrongly. Read them and rename
where the name says "MEDIA_SECTION" rather than what it pins.

- [ ] **Step 7: Drive the app**

```bash
npm run dev
```

Open a companion with media, ask her for something, and watch: the search runs,
she sends, the picture lands in the transcript and the lightbox. Ask for the
same thing again and confirm a different picture comes back. Ask for something
the set doesn't have and confirm she says so rather than announcing one.

Check the Companions debug tab's "Prompt cached" row is still climbing across
turns — the summary fills at load, so it must not have moved the cache boundary.

- [ ] **Step 8: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add src/lib/companions/shared-prompt.ts src/lib/goonpacks/prompt.ts \
  src/lib/goonpacks/prompt.test.ts src/lib/goonpacks/resolve.ts \
  src/lib/goonpacks/resolve.test.ts
git commit -m "Prompt: the set summary in place of a list of everything"
```

---

### Task 5: Documentation and changelog

**Files:**

- Modify: `modes/COMPANIONS.md:89`, `:140-141`
- Modify: `GOONPACKS.md:228-232`, `:288`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: `modes/COMPANIONS.md`**

Its tool list names `send_media`; add `search_media` beside it. Its "A companion
**with media**" paragraph describes the tool's description as one numbered list
over everything they have — replace that with how it actually works now: their
prompt carries a summary of what the set contains, they search it in words, and
they send one of the matches. This is user-facing, so no repo mechanics.

- [ ] **Step 2: `GOONPACKS.md`**

Its `{{MEDIA_SECTION}}` entry says the section is "how they choose and send
pictures and videos" — still true, but it should say the pack's `mediaSummary`
is what fills it, since that is a pack author's lever. Check `:288`'s sentence
about a sent picture staying in the conversation as a stable reference; it is
still true and now more so.

- [ ] **Step 3: Changelog**

```markdown
- feature: **Companions find a picture instead of picking one** — A companion
  used to be handed a numbered list of everything she had and asked to pick by
  number, which stops working once there are more than a few dozen. She now
  knows roughly what her set contains, searches it in her own words when she
  wants to show you something, and sends one of the matches. Two things come
  with it: she won't send you the same picture twice in a session, and when
  nothing matches she says so instead of talking about a picture that never
  arrived. ([#N](https://github.com/autogoon/autogoon/pull/N))
```

- [ ] **Step 4: Gates and commit**

```bash
npm run format && npm test
git add modes/COMPANIONS.md GOONPACKS.md CHANGELOG.md
git commit -m "Docs: asking for a picture, not picking one"
```

---

## Before the PR

Per [CLAUDE.md](../../../CLAUDE.md) → Git workflow, in this order:
`/code-check`, `/test-check`, `/doc-check`, `/style-check`, `/personal-check`.

Two things for `/test-check` in particular. The search's tests assert ranking
over a fixture the test itself wrote, so check each one would fail if the
scoring broke rather than merely restating the fixture. And nothing here fakes
the LLM: the tools' `run` handlers are pure, and whether a model actually calls
them well is what Task 4's step 7 is for.
