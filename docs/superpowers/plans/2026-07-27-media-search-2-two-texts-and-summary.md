# Two texts and a set summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every media item carries a long description as well as its caption,
every pack with media carries a summary of that set, and a pack missing either
is refused.

**Architecture:** The one-line `.txt` sidecar becomes a `.md` per item — caption
in YAML frontmatter, long description as the body — parsed by one module so the
frontmatter library is contained to a single import. The set summary rides in
`manifest.json` and follows the media through overlay resolution, since an
overlay that supplies media replaces the base's set wholesale. Both texts and
the summary become required, enforced in `parsePack`, which `goonpack-build.ts`
already runs — so one rule covers building and importing.

**Tech Stack:** TypeScript, Jest (unit, colocated), Playwright (e2e), a YAML
frontmatter library (new dependency — see Task 1).

This is steps 1–3 of
[the media search design](../specs/2026-07-27-media-search-design.md). It
depends on [Phase 0](./2026-07-27-media-search-1-pack-format.md) having landed,
because Task 4 here adds rules to a validator Phase 0 restructures. Steps 4–5
(the two tools) are
[their own plan](./2026-07-27-media-search-3-search-and-send.md).

## Global Constraints

- **Change files with Edit and Write only** — never `sed -i`, a heredoc, or a
  redirect into a tracked path. A PreToolUse hook denies the shapes it can spot.
- **Zero warnings**: `npm run lint` runs with `--max-warnings 0`.
- **Gates before the PR**: `npm run typecheck`, `npm run lint`,
  `npm run format`, `npm test`, `npm run test:e2e`.
- **Both texts are stored opaquely.** Nothing in the format may assume anything
  about the long description's internal structure or the summary's — what they
  should say belongs to
  [roadmap/INFERENCE-LIBRARY.md](../../../roadmap/INFERENCE-LIBRARY.md), and it
  will change.
- **CHANGELOG.md is part of the work**, not a follow-up.
- **Adding a dependency needs the go-ahead** before Task 1 runs.

## What already handles this

Two things are in place and must not be "fixed":

- `.prettierrc` already sets `proseWrap: "preserve"` for `goonpacks/**/*.md`, so
  a sidecar body is not rewrapped by `npm run format`. Leave that override
  alone; without it every description would be reflowed on every format run.
- `scripts/describe-image.mjs` already returns `{ caption, observations }` from
  `describeImage()` and prints both. Only the write site discards the
  observations, so Task 2 is a change to what gets written, not to how anything
  is generated.

## File Structure

| File                                | Responsibility                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/lib/goonpacks/sidecar.ts`      | New. Parse and render a `.md` sidecar: `{caption, description}` ⇄ text. Sole home of the frontmatter library. |
| `src/lib/goonpacks/sidecar.test.ts` | New. Frontmatter rules, unknown keys, a body containing `---`.                                                |
| `src/lib/goonpacks/pack.ts`         | Reads `.md` sidecars; refuses media missing either text, and a pack with media and no summary.                |
| `src/lib/goonpacks/manifest.ts`     | `mediaSummary` as an optional top-level field.                                                                |
| `src/lib/goonpacks/resolve.ts`      | The summary follows the media through an overlay.                                                             |
| `src/lib/companions/companions.ts`  | `CompanionMedia.description`; `Companion.mediaSummary`.                                                       |
| `src/lib/goonpacks/library.ts`      | Carries both texts and the summary onto the built companion.                                                  |
| `scripts/describe-image.mjs`        | Writes a `.md` sidecar with both texts.                                                                       |
| `scripts/describe-missing.mjs`      | Finds images with no `.md` sidecar.                                                                           |
| `scripts/summarise-pack.mjs`        | New. Generates a pack's `mediaSummary` from its own sidecars.                                                 |
| `GOONPACKS.md`                      | Documents the sidecar and `mediaSummary`.                                                                     |
| `CHANGELOG.md`                      | One `internal` entry.                                                                                         |

---

### Task 1: The sidecar module

**Files:**

- Create: `src/lib/goonpacks/sidecar.ts`
- Create: `src/lib/goonpacks/sidecar.test.ts`
- Modify: `package.json` (one dependency)

**Interfaces:**

- Consumes: nothing.
- Produces — every later task and
  [the tools plan](./2026-07-27-media-search-3-search-and-send.md) depend on
  these exact names:

```ts
export type Sidecar = { caption: string; description: string };
export function parseSidecar(text: string): Sidecar; // throws SidecarError
export function renderSidecar(s: Sidecar): string;
export class SidecarError extends Error {}
export const SIDECAR_EXT = 'md';
```

- [ ] **Step 1: Add the dependency**

The parser ships to the browser (`parsePack` runs in the app), so the library
must be browser-safe. `gray-matter` is Node-oriented and is not the choice.

```bash
npm install yaml
```

Confirm it added a `dependencies` entry, not a dev one. If the bundle cost turns
out to matter later, `front-matter` is the swap and this file is the only place
it is imported.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/goonpacks/sidecar.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { parseSidecar, renderSidecar, SidecarError } from './sidecar';

const file = `---
caption: A woman on a beach at sunset.
---

She stands at the waterline, facing away.

Behind her the sun is low.
`;

describe('parseSidecar', () => {
  it('reads the caption from the frontmatter and the description from the body', () => {
    const s = parseSidecar(file);
    expect(s.caption).toBe('A woman on a beach at sunset.');
    expect(s.description).toBe(
      'She stands at the waterline, facing away.\n\nBehind her the sun is low.',
    );
  });

  it('keeps a body that contains a horizontal rule intact', () => {
    const s = parseSidecar(
      `---\ncaption: One.\n---\n\nBefore.\n\n---\n\nAfter.\n`,
    );
    expect(s.description).toContain('---');
  });

  it('names an unknown frontmatter key rather than dropping it silently', () => {
    expect(() =>
      parseSidecar(`---\ncaption: One.\ncapton: Two.\n---\n\nBody.\n`),
    ).toThrow(/capton/);
  });

  it('refuses a sidecar with no frontmatter, which is the old one-line format', () => {
    expect(() => parseSidecar('Just a caption line.\n')).toThrow(SidecarError);
  });

  it('refuses a sidecar whose caption is missing or empty', () => {
    expect(() => parseSidecar(`---\ncaption: ''\n---\n\nBody.\n`)).toThrow(
      /caption/,
    );
  });

  it('refuses a sidecar with an empty body, since the description is the point', () => {
    expect(() => parseSidecar(`---\ncaption: One.\n---\n`)).toThrow(
      /description/,
    );
  });
});

describe('renderSidecar', () => {
  it('round-trips a sidecar through parseSidecar unchanged', () => {
    const s = {
      caption: 'A caption: with a colon.',
      description: 'A body.',
    };
    expect(parseSidecar(renderSidecar(s))).toEqual(s);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/lib/goonpacks/sidecar.test.ts`

Expected: FAIL — `Cannot find module './sidecar'`.

- [ ] **Step 4: Write the module**

Create `src/lib/goonpacks/sidecar.ts`:

```ts
// A media item's sidecar: one `.md` beside the file, carrying the caption in
// YAML frontmatter and the long description as the body. The body is stored
// opaquely — what a description should say belongs to the inference roadmap and
// will change, so nothing here reads into it.
//
// The frontmatter library is imported here and nowhere else, so swapping it is
// a one-file change.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// The field names are the ones ParsedMedia and CompanionMedia use, so reading a
// sidecar into an item copies both across with nothing to get backwards.
export type Sidecar = { caption: string; description: string };

export const SIDECAR_EXT = 'md';

export class SidecarError extends Error {}

// Frontmatter keys a sidecar may carry. An unknown key is refused rather than
// ignored: a mistyped `capton:` would otherwise lose the caption silently.
const KEYS = new Set(['caption']);

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseSidecar(text: string): Sidecar {
  const match = FENCE.exec(text);
  if (match === null) {
    throw new SidecarError(
      'A sidecar needs YAML frontmatter opening the file with ---.',
    );
  }
  let front: unknown;
  try {
    front = parseYaml(match[1]!);
  } catch {
    throw new SidecarError("The sidecar's frontmatter isn't valid YAML.");
  }
  if (typeof front !== 'object' || front === null || Array.isArray(front)) {
    throw new SidecarError("The sidecar's frontmatter isn't a set of fields.");
  }
  const fields = front as Record<string, unknown>;
  for (const key of Object.keys(fields)) {
    if (!KEYS.has(key)) {
      throw new SidecarError(
        `Unknown field in the sidecar frontmatter: ${key}.`,
      );
    }
  }
  const caption = fields.caption;
  if (typeof caption !== 'string' || caption.trim() === '') {
    throw new SidecarError(
      'The sidecar needs a caption field with text in it.',
    );
  }
  const description = text.slice(match[0].length).trim();
  if (description === '') {
    throw new SidecarError(
      'The sidecar needs a description in the body, under the frontmatter.',
    );
  }
  return { caption: caption.trim(), description };
}

export function renderSidecar(s: Sidecar): string {
  return `---\n${stringifyYaml({ caption: s.caption })}---\n\n${s.description}\n`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/lib/goonpacks/sidecar.test.ts`

Expected: PASS. If the round-trip test fails on the colon, `stringifyYaml` is
quoting differently than expected — read its output and adjust the expectation,
not the quoting.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add src/lib/goonpacks/sidecar.ts src/lib/goonpacks/sidecar.test.ts \
  package.json package-lock.json
git commit -m "Sidecars: a caption in frontmatter and a description in the body"
```

---

### Task 2: The describing scripts write both texts

**Files:**

- Modify: `scripts/describe-image.mjs:203-208`, `:340`
- Modify: `scripts/describe-missing.mjs:32`, `:82`

**Interfaces:**

- Consumes: the sidecar shape from Task 1. These are `.mjs` and cannot import
  the TypeScript module, so they render the same two-part file by hand — Task
  1's `parseSidecar` is what reads it back, and `sidecar.test.ts` is what pins
  the shape they must produce.
- Produces: `sidecarPath(imagePath)` returning a `.md` path.

- [ ] **Step 1: Point `sidecarPath` at `.md`**

In `scripts/describe-image.mjs`:

```js
// The sidecar path for an image: <basename>.md beside it, carrying the caption
// in frontmatter and the model's full observations as the body.
export function sidecarPath(imagePath) {
  return join(
    dirname(imagePath),
    `${basename(imagePath, extname(imagePath))}.md`,
  );
}
```

- [ ] **Step 2: Write both texts**

`describeImage()` already returns `{ caption, observations }`. Add a renderer
beside `sidecarPath`, matching what `parseSidecar` accepts:

```js
// The sidecar's text. The caption is quoted unconditionally: captions routinely
// contain a colon, which is YAML's key separator.
export function renderSidecar(caption, observations) {
  const quoted = `"${caption.replace(/"/g, '\\"')}"`;
  return `---\ncaption: ${quoted}\n---\n\n${observations}\n`;
}
```

At `describe-image.mjs:340`, replace the write:

```js
writeFileSync(sidecarPath(imagePath), renderSidecar(caption, observations));
```

And the same at `describe-missing.mjs:82`:

```js
writeFileSync(sidecarPath(image), renderSidecar(caption, observations));
```

Import `renderSidecar` alongside the existing `describeImage` and `sidecarPath`
in `describe-missing.mjs`.

- [ ] **Step 3: Handle a model that skipped its observations**

`describeImage()` documents `observations` as `""` when the model skipped them,
and an empty body is refused by `parseSidecar`. In both write sites, fail loudly
rather than writing a sidecar that won't parse:

```js
if (observations === '') {
  throw new Error(
    'The model returned a caption with no observations — the sidecar needs both.',
  );
}
```

In `describe-missing.mjs` this belongs inside the existing per-image `try`, so
one bad image counts as a failure and the run continues.

- [ ] **Step 4: Update the file header comment**

`describe-image.mjs` opens by saying it writes the caption to `<basename>.txt`
and that "only the caption reaches the sidecar". Both are now wrong. Rewrite
that paragraph to say it writes a `<basename>.md` carrying the caption in
frontmatter and the observations as the body.

- [ ] **Step 5: Find images by the new sidecar**

In `scripts/describe-missing.mjs`, its discovery treats an image as described
when the sidecar exists. That still holds once `sidecarPath` returns `.md`, so
check no other place hardcodes `.txt`:

Run: `grep -rn "\.txt" scripts/`

Expected: no remaining sidecar references. Anything left is a real finding — fix
it here.

- [ ] **Step 6: Describe one image and read the result**

```bash
npm run goonpack:describe goonpacks/elise/media/<a file>.jpg
```

Expected: a `.md` beside it, opening with `---`, a quoted `caption:` line, then
a blank line and the observations. Confirm the old `.txt` is not left behind —
if one exists from before, delete it by hand.

- [ ] **Step 7: Gates and commit**

```bash
npm run lint && npm run format
git add scripts/describe-image.mjs scripts/describe-missing.mjs
git commit -m "describe: write the observations, not just the caption"
```

---

### Task 3: The summary in the manifest, and the script that writes it

**Files:**

- Modify: `src/lib/goonpacks/manifest.ts` — `TOP_FIELDS`, `PackManifest`,
  validation
- Create: `scripts/summarise-pack.mjs`
- Modify: `package.json` — one script entry
- Test: `src/lib/goonpacks/manifest.test.ts`

**Interfaces:**

- Consumes: `parseSidecar` from Task 1.
- Produces: `PackManifest.mediaSummary?: string`, and
  `npm run goonpack:summarise <packdir>`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/goonpacks/manifest.test.ts`, inside the `parseManifest` describe:

```ts
it('carries a media summary through as written', () => {
  expect(
    parseManifest({ ...good, mediaSummary: 'Mostly beach shots.' })
      .mediaSummary,
  ).toBe('Mostly beach shots.');
});
it("rejects a media summary that isn't text", () => {
  expect(() => parseManifest({ ...good, mediaSummary: 3 })).toThrow(
    /mediaSummary/,
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/lib/goonpacks/manifest.test.ts`

Expected: FAIL — the first because `mediaSummary` is an unknown top-level field,
the second because it is too.

- [ ] **Step 3: Add the field**

In `src/lib/goonpacks/manifest.ts`, add `'mediaSummary'` to `TOP_FIELDS`, and to
`PackManifest`:

```ts
  // What the pack's media set contains, as one opaque block of text shown to
  // the companion instead of a list of items. Generated from the pack's own
  // sidecars (npm run goonpack:summarise); what it should say belongs to the
  // inference roadmap, so nothing here reads into it.
  mediaSummary?: string;
```

Validate it beside the other optional strings, using the existing
`optionalString` helper so the message matches its neighbours, and carry it in
the returned object.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/lib/goonpacks/manifest.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the summarising script**

Create `scripts/summarise-pack.mjs`. It reads every `.md` sidecar under a pack
source's `media/`, sends the captions and descriptions to the LLM, and writes
the reply into that pack's `manifest.json` as `mediaSummary`.

Model it on `describe-missing.mjs`: same `LLM_URL`/`OPENROUTER_API_KEY`
handling, same colour helpers, same "narrate as it goes" output. The prompt asks
for what the set contains — the vocabulary present in it, the proportions, who
appears — and is quoted from **The set summary** in
[roadmap/INFERENCE-LIBRARY.md](../../../roadmap/INFERENCE-LIBRARY.md); read that
section and write the prompt from it rather than inventing one here, since that
document owns what a summary must carry.

Write the manifest back with `JSON.stringify(manifest, null, 2)` so the diff
stays readable, and print the summary so a run can be judged without opening the
file.

Add to `package.json`:

```json
    "goonpack:summarise": "node --env-file-if-exists=.env scripts/summarise-pack.mjs",
```

- [ ] **Step 6: Run it against the example pack**

```bash
npm run goonpack:summarise goonpacks/elise
```

Expected: a `mediaSummary` in `goonpacks/elise/manifest.json`, and the summary
printed. Read it — if it enumerates items rather than vocabulary, the prompt
needs work, and that is the point of running it now rather than after Task 4.

- [ ] **Step 7: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format && npm test
git add src/lib/goonpacks/manifest.ts src/lib/goonpacks/manifest.test.ts \
  scripts/summarise-pack.mjs package.json
git commit -m "Packs: a summary of the media set, and the script that writes it"
```

---

### Task 4: Both texts required, and the summary with them

**Files:**

- Modify: `src/lib/goonpacks/pack.ts` — the sidecar read and the completeness
  rules
- Modify: `src/lib/companions/companions.ts` — `CompanionMedia`, `Companion`
- Modify: `src/lib/goonpacks/library.ts:90-105`
- Modify: `src/lib/goonpacks/resolve.ts:84-95`
- Test: `src/lib/goonpacks/pack.test.ts`, `src/lib/goonpacks/resolve.test.ts`

**Interfaces:**

- Consumes: `parseSidecar`, `SIDECAR_EXT`, `SidecarError` from Task 1;
  `PackManifest.mediaSummary` from Task 3.
- Produces — [the tools plan](./2026-07-27-media-search-3-search-and-send.md)
  consumes these exact names:

```ts
// src/lib/goonpacks/pack.ts
export type ParsedMedia = {
  name: string;
  file: string;
  kind: MediaKind;
  mimeType: string;
  caption: string; // one line — was `description`
  description: string; // the sidecar body, in prose
};

// src/lib/companions/companions.ts
export type CompanionMedia = {
  kind: MediaKind;
  caption: string; // was `description`
  description: string;
  ref: string;
  src?: string;
  load(): Promise<string>;
  forget(): void;
};
// Companion gains:
  mediaSummary?: string; // present whenever `media` is
```

Step 1 does the rename that makes this read straight. Until it runs, both types
call a one-line caption `description`, which is why `Sidecar` can use the
obvious field names: after the rename nothing crosses.

- [ ] **Step 1: Rename the caption field to `caption`**

`ParsedMedia.description` and `CompanionMedia.description` hold a one-line
caption and have since the pack format existed. Freeing the name is what lets
the long text be called `description` — otherwise every site reading a sidecar
has to cross two same-typed strings, which typechecks whichever way round it is
written.

Do it with the TypeScript language server's rename, from the field's declaration
in each of the two types. It resolves the symbol, so it reaches every read of
_this_ field and cannot touch a same-named field on another type —
`Companion.description` is the picker-card blurb, and tool declarations and
play-mode cards each have their own.

The sites it should land on, as a cross-check that it reached everything:

- `src/lib/goonpacks/pack.ts` — the `ParsedMedia` declaration, and the
  assignment in `parsePack` (`m.description = sidecars.get(m.name) ?? ''`)
- `src/lib/companions/companions.ts` — the `CompanionMedia` declaration
- `src/lib/goonpacks/library.ts` — `description: m.description` in `mediaEntry`
- `src/lib/companions/send-media.ts` — both uses, in `describeMediaList` and in
  `pickMedia`'s result string
- `src/components/play-modes/companions-panel/media-bubble.test.tsx` and
  `src/hooks/use-media-url.test.ts` — the `description: 'a still'` fixtures

Run `npm run typecheck` after. A site the rename missed is a type error, and a
field it should not have touched is one too.

- [ ] **Step 2: Write the failing tests**

In `src/lib/goonpacks/pack.test.ts`:

```ts
it('reads both texts from a media item's sidecar', async () => {
  const pack = await parsePack(
    tree({
      'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
      'system-prompt.md': 'You are Testy.',
      'media/a.jpg': '',
      'media/a.md': '---\ncaption: "A caption."\n---\n\nA long description.\n',
    }),
  );
  expect(pack.media[0]?.description).toBe('A caption.');
  expect(pack.media[0]?.description).toBe('A long description.');
});

it('refuses a media file with no sidecar rather than describing it as nothing', async () => {
  await expect(
    parsePack(
      tree({
        'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
        'system-prompt.md': 'You are Testy.',
        'media/a.jpg': '',
      }),
    ),
  ).rejects.toThrow(/a\.jpg/);
});

it('names the sidecar that failed to parse, not just the pack', async () => {
  await expect(
    parsePack(
      tree({
        'manifest.json': complete({ mediaSummary: 'Beach shots.' }),
        'system-prompt.md': 'You are Testy.',
        'media/a.jpg': '',
        'media/a.md': 'no frontmatter here\n',
      }),
    ),
  ).rejects.toThrow(/a\.md/);
});

it('refuses a pack that carries media and no summary of it', async () => {
  await expect(
    parsePack(
      tree({
        'manifest.json': complete(),
        'system-prompt.md': 'You are Testy.',
        'media/a.jpg': '',
        'media/a.md': '---\ncaption: "A caption."\n---\n\nA description.\n',
      }),
    ),
  ).rejects.toThrow(/mediaSummary/);
});

it('accepts a pack with no media and no summary, which needs none', async () => {
  const pack = await parsePack(
    tree({
      'manifest.json': complete(),
      'system-prompt.md': 'You are Testy.',
    }),
  );
  expect(pack.media).toEqual([]);
});
```

In `src/lib/goonpacks/resolve.test.ts`:

```ts
it('takes the summary from whichever pack supplied the media', () => {
  const base = companion({ mediaSummary: 'Base set.' });
  const resolved = applyOverlay(
    base,
    overlay({ mediaSummary: 'Overlay set.' }, [mediaItem('x')]),
  );
  expect(resolved.mediaSummary).toBe('Overlay set.');
});

it('keeps the base summary when an overlay supplies no media', () => {
  const base = companion({ mediaSummary: 'Base set.' });
  expect(applyOverlay(base, overlay({})).mediaSummary).toBe('Base set.');
});

it('drops the summary with the media when an overlay sets noMedia', () => {
  const base = companion({ mediaSummary: 'Base set.' });
  expect(
    applyOverlay(base, overlay({ noMedia: true })).mediaSummary,
  ).toBeUndefined();
});
```

Extend `resolve.test.ts`'s existing `overlay()` helper to take manifest extras
and media, matching how it already builds a `PackContent`.

- [ ] **Step 3: Run to verify they fail**

Run: `npx jest src/lib/goonpacks/pack.test.ts src/lib/goonpacks/resolve.test.ts`

Expected: FAIL on all of them — `description` doesn't exist, a missing sidecar
is currently an empty description, and `mediaSummary` isn't resolved.

- [ ] **Step 4: Read `.md` sidecars in `parsePack`**

`parsePack` collects `ext === 'txt'` paths into `captions`, then reads each into
a `sidecars` map keyed by stem and assigns
`m.description = sidecars.get(...) ?? ''`. Change the extension it collects to
`SIDECAR_EXT`, parse each through `parseSidecar`, and assign both texts. A
sidecar that fails to parse becomes a problem naming the file; a media file
whose stem has no sidecar becomes a problem naming the media file.

Keep the existing comment's point — sidecars are the only media-folder files
ever read — and update it to say each is a `.md` carrying two texts.

Note that Phase 0's path rule already refuses anything in `media/` that is
neither media nor a sidecar, so an orphaned `.md` with no media file is caught
by the stem pairing rather than needing its own rule. Add a problem for it if
the pairing doesn't already produce one.

- [ ] **Step 5: Require the summary**

In the completeness block — where `noMedia` alongside a `media/` folder is
already refused — add: media present and `manifest.mediaSummary` absent is a
problem naming `mediaSummary` and saying `npm run goonpack:summarise` writes it.

- [ ] **Step 6: Carry both through to the companion**

Add `description` to `CompanionMedia` and `mediaSummary` to `Companion` in
`src/lib/companions/companions.ts`, with the field comments saying what each is
for. In `library.ts`'s `mediaEntry`, pass `description: m.description` alongside
the existing `description`, and set `mediaSummary` from the manifest where the
companion is built.

In `resolve.ts`'s `applyOverlay`, the summary follows the media through the same
ternary that already chooses it:

```ts
const media =
  m.noMedia === true
    ? undefined
    : overlay.media.length > 0
      ? overlay.media
      : base.media;
// The summary describes whichever set won, so it moves with it.
const mediaSummary =
  m.noMedia === true
    ? undefined
    : overlay.media.length > 0
      ? m.mediaSummary
      : base.mediaSummary;
```

and add `mediaSummary` to the returned object.

- [ ] **Step 7: Run to verify they pass**

Run: `npm test`

Expected: PASS. Fixtures elsewhere that build a pack with media will now need a
`mediaSummary` and a `.md` sidecar — that is the rule working, so fix the
fixtures.

- [ ] **Step 8: Rebuild every pack**

```bash
npm run goonpack:describe-missing
npm run goonpack:summarise goonpacks/elise
npm run goonpack:build
```

Every pack source needs its sidecars regenerated and a summary written before it
builds. Run `goonpack:summarise` once per pack source; find them with
`ls -d goonpacks/*/`.

- [ ] **Step 9: The e2e import fixtures**

`tests/e2e/goonpack-import.spec.ts`'s `completePack` carries `media/one.txt`.
Change it to `media/one.md` with frontmatter and a body, and add a
`mediaSummary` to its manifest. Then:

Run: `npm run test:e2e -- goonpack-import`

Expected: PASS on all three browsers.

- [ ] **Step 10: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add src/lib/goonpacks/pack.ts src/lib/goonpacks/pack.test.ts \
  src/lib/goonpacks/resolve.ts src/lib/goonpacks/resolve.test.ts \
  src/lib/goonpacks/library.ts src/lib/companions/companions.ts \
  src/lib/companions/send-media.ts src/hooks/use-media-url.test.ts \
  src/components/play-modes/companions-panel/media-bubble.test.tsx \
  tests/e2e/goonpack-import.spec.ts goonpacks/elise
git commit -m "Packs: both texts per item, and a summary of the set, both required"
```

---

### Task 5: Documentation and changelog

**Files:**

- Modify: `GOONPACKS.md` — the `## media/` section and the manifest field list
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the sidecar**

In `GOONPACKS.md`'s `## media/` section, replace the one-line `.txt` description
with the `.md` shape: caption in frontmatter, description in the body, one per
media file, both required. Show a short example file. Say that
`npm run goonpack:describe` writes it, so nobody hand-writes one by mistake.

- [ ] **Step 2: Document `mediaSummary`**

Add it to the manifest field list, under the optional fields, saying what it is
for in a pack author's terms — the companion is told what the set contains
rather than being handed a list — and that `npm run goonpack:summarise` writes
it, and that a pack with media must have one.

- [ ] **Step 3: Add the changelog entry**

```markdown
- internal: **Packs carry two texts per item and a summary of the set** — Each
  picture or video now has a `.md` beside it holding a one-line caption and the
  describing model's full observations, instead of a caption alone; the
  observations were being thrown away, and keeping them means a better caption
  is a re-condense of text already on disk rather than another pass over every
  image. A pack that carries media also carries a summary of what that set
  contains, written by `npm run goonpack:summarise`. Both are required: a pack
  missing either is refused when it is built and when it is imported.
  ([#N](https://github.com/autogoon/autogoon/pull/N))
```

- [ ] **Step 4: Gates and commit**

```bash
npm run format && npm test
git add GOONPACKS.md CHANGELOG.md
git commit -m "Docs: the sidecar's two texts, and the set summary"
```

---

## Before the PR

Per [CLAUDE.md](../../../CLAUDE.md) → Git workflow, in this order:
`/code-check`, `/test-check`, `/doc-check`, `/style-check`, `/personal-check`.

`/personal-check` matters here for the same reason as Phase 0, and one more:
Task 3 and Task 4 both run generation over real pack media, and a summary is a
description of a real set. Nothing about any pack's contents belongs in the PR
text, the changelog, or this plan — only the tracked example pack is ever named.
