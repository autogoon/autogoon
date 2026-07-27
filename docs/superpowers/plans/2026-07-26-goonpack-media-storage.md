# Goonpack media storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move installed goonpacks from whole-zip `ArrayBuffer`s in IndexedDB to
one extracted OPFS directory tree per pack, so media bytes are never resident in
memory, validation never touches media, and video plays from a seekable `File`.

**Architecture:** A pack is extracted once, at import, into
`goonpacks/<id@version>/` in OPFS by a Worker streaming the zip; a marker file
written last means the tree is complete. Nothing derived is persisted: at every
app load the library walks the trees, reads only `manifest.json`,
`system-prompt.md` and the `.txt` captions, applies the cross-pack rules, and
builds one in-memory index for the session. A media file becomes an object URL
only on first render, and that URL lives as long as its index entry.

**Tech Stack:** Next 16 / React 19, TypeScript (strict,
`noUncheckedIndexedAccess`), `fflate` (streaming `Unzip`), OPFS
(`navigator.storage.getDirectory()`), a dedicated module Worker, Jest (node env)
for the pure lib, Playwright (Chromium/Firefox/WebKit) for anything that touches
OPFS.

**Spec:**
[`docs/superpowers/specs/2026-07-26-goonpack-media-storage-design.md`](../specs/2026-07-26-goonpack-media-storage-design.md).
Read it before Task 1 — this plan implements it and does not restate its
reasoning.

## Global Constraints

- **Branch:** all work lands on `goonpack-media-storage` (already checked out).
- **No backwards compatibility.** Installed packs are not carried over and
  existing threads' picture references are not preserved. Do not write a
  migration. The only nod to the old world is a one-off
  `indexedDB.deleteDatabase('autogoon-goonpacks')` at app load.
- **Zero-warning outfit.** `npm run lint` runs with `--max-warnings 0`. Every
  task ends with `npm run typecheck` and `npm run lint` producing no output —
  including warnings your change didn't cause.
- **`npm run format`** before any commit that touches `src/`, `tests/`,
  `scripts/`, `goonpacks/**/*.{md,json}`, or the repo's Markdown. Commit the
  formatting changes as part of the work.
- **Public, pseudonymous repo.** Never commit real names, `/Users/<name>` paths,
  personal URLs or session links. Genericise concrete paths in docs.
- **Pack format version is `2`** (`PACK_FORMAT` in
  `src/lib/goonpacks/manifest.ts`). A **format 1** pack is accepted only when it
  used neither of the two things the formats differ over — no `pictures/` folder
  and no `noPictures` field — because such a pack already _is_ a format 2 pack.
  Otherwise it is rejected with `OLD_LAYOUT_PROBLEM`.
- **Stills:** `.jpg`, `.jpeg`, `.png`, `.webp`. **Videos:** `.mp4`, `.webm`.
  **`.mov` is rejected with a message saying so.**
- **Vocabulary:** `pictures/` → `media/`, `noPictures` → `noMedia`,
  `{{PICTURES_SECTION}}` → `{{MEDIA_SECTION}}`. In code, comments, UI copy and
  docs, a still is a **picture** and a moving image is a **video** — never a
  "clip". "Media" is the collective noun. (`MediaKind`'s values stay
  `'image' | 'video'`, matching the MIME families.)
- **Docs point at code.** Never copy a type, command list or config value into a
  doc — link the source file and say what it's for. Comments describe what the
  code does now, never what it replaced or what's coming.
- **Commit only when a task says to.** Do not push, open a PR or merge — those
  are separate, explicitly-requested actions.

## File Structure

New:

| File                                                          | Responsibility                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/goonpacks/media.ts`                                  | The media vocabulary: extension → kind + MIME, name splitting, zip/tree junk. No I/O, no manifest knowledge.                                                                                                                           |
| `src/lib/goonpacks/library.ts`                                | Builds the whole in-memory index from an injected tree source: walk keys → `parsePack` each → cross-pack rules → entries, rows and per-pack content with lazy media URLs. Also owns the session singleton and its object-URL lifetime. |
| `src/lib/goonpacks/extract.ts`                                | Zip → OPFS tree, streaming, with backpressure and progress. Also `peekZip` (read `manifest.json` out of a zip without extracting). Worker-agnostic.                                                                                    |
| `src/lib/goonpacks/extract-worker.ts`                         | The dedicated Worker wrapper around `extract.ts` — receives a `File` + directory handle, posts progress.                                                                                                                               |
| `src/lib/goonpacks/import.ts`                                 | The import pipeline the UI drives: quota check, persistence request, spawn the worker, validate the extracted tree, write or delete.                                                                                                   |
| `src/hooks/use-media-url.ts`                                  | React glue for a `CompanionMedia`'s lazy object URL.                                                                                                                                                                                   |
| `src/components/play-modes/companions-panel/media-bubble.tsx` | A sent still or video in the transcript (`<img>` or `<video>`).                                                                                                                                                                        |

Replaced or reshaped:

| File                                                                                                                                           | Change                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/goonpacks/store.ts`                                                                                                                   | IndexedDB zip store → OPFS trees, the marker, the clean pass, the legacy purge.                                                                                             |
| `src/lib/goonpacks/pack.ts`                                                                                                                    | `parsePack` becomes an async, name-level validation pass over a `PackTree`; `ParsedPicture.bytes` goes; `peekPack(zipBytes)` becomes `peekManifest(text)`.                  |
| `src/lib/goonpacks/manifest.ts`                                                                                                                | `PACK_FORMAT = 2`, `noPictures` → `noMedia`, a format-1 pack gets the old-layout message.                                                                                   |
| `src/lib/goonpacks/entries.ts`                                                                                                                 | `PackSummary`/`PackOption` carry media (`images` + `videos`), `VariantSlot` gains `media`, `effectivePictures` → `effectiveMedia`, plus a shared `describeMedia` formatter. |
| `src/lib/goonpacks/resolve.ts`                                                                                                                 | `PackContent.media`, `resolvePictureRef` → `resolveMediaRef` returning the entry (not a src), `noMedia`.                                                                    |
| `src/lib/goonpacks/prompt.ts`, `src/lib/companions/shared-prompt.ts`                                                                           | `PICTURES_SECTION` → `MEDIA_SECTION`, its text covering videos and naming the `send_media` tool.                                                                            |
| `src/lib/companions/companions.ts`                                                                                                             | `CompanionPicture` → `CompanionMedia` (kind, required `ref`, lazy `load()`); `Companion.pictures` → `Companion.media`.                                                      |
| `src/lib/companions/conversation.ts`, `tools.ts`, `src/hooks/use-voice-session.ts`                                                             | `imageSrc` → `mediaRef` on the tool turn.                                                                                                                                   |
| `src/hooks/use-goonpack-library.ts`                                                                                                            | A thin React wrapper over `library.ts` + `import.ts`; loses the reindex, the unzip and the object-URL bookkeeping.                                                          |
| `src/components/goonpacks-panel.tsx`                                                                                                           | Import progress; media counts.                                                                                                                                              |
| `src/components/play-modes/companions-panel/index.tsx`, `lightbox.tsx`, `picture-bubble.tsx`, `missing-picture-bubble.tsx`, `chooser-card.tsx` | `send_media`, videos as `<video>`, media counts.                                                                                                                            |
| `scripts/goonpack-build.ts`, `scripts/describe-missing.mjs`, `scripts/describe-image.mjs`                                                      | `media/`; videos zipped, and skipped by the captioners.                                                                                                                     |
| `GOONPACKS.md`, `ARCHITECTURE.md`, `DEVELOPERS.md`, `README.md`, `modes/COMPANIONS.md`, `CHANGELOG.md`, `.gitignore`                           | Docs and the ignore rule.                                                                                                                                                   |
| `tests/e2e/goonpack-import.spec.ts`                                                                                                            | Round-trip over OPFS.                                                                                                                                                       |

**Why `library.ts` exists as a module singleton, not hook state.** Two
components each hold their own `useGoonpackLibrary()` instance (the Companions
chooser and the Goonpacks tab). The spec requires the index to live "in a
variable for the session" and an object URL to live "as long as its index
entry"; two independent indexes would mint two URLs per media file and neither
would know when to revoke. One module-level index, with a listener set for
React, is what makes that invariant true.

---

## Task 1: Media vocabulary in the pure lib

Rename the pack format's picture concepts to media, everywhere the change is
mechanical, and bump the format version. No behaviour changes yet: packs are
still zips in IndexedDB and everything is still a still image.

**Files:**

- Create: `src/lib/goonpacks/media.ts`
- Create: `src/lib/goonpacks/media.test.ts`
- Modify: `src/lib/goonpacks/manifest.ts`
- Modify: `src/lib/goonpacks/entries.ts`
- Modify: `src/lib/goonpacks/prompt.ts`
- Modify: `src/lib/companions/shared-prompt.ts:63-73` (`PICTURES_SECTION`)
- Modify: `src/lib/goonpacks/pack.ts` (compile fixes only — `noPictures` →
  `noMedia`, `IMAGE_TYPES`/`isJunk` now come from `media.ts`)
- Modify: `src/lib/goonpacks/resolve.ts` (compile fixes only — `noMedia`,
  `includeMedia`)
- Modify: `src/hooks/use-goonpack-library.ts` (compile fixes only — `summarize`)
- Modify: `src/components/goonpacks-panel.tsx` (compile fixes only — `contents`)
- Modify: `src/components/play-modes/companions-panel/chooser-card.tsx`
- Test: `src/lib/goonpacks/manifest.test.ts`,
  `src/lib/goonpacks/entries.test.ts`, `src/lib/goonpacks/prompt.test.ts`,
  `src/lib/goonpacks/pack.test.ts`, `src/lib/goonpacks/resolve.test.ts`

**Interfaces:**

- Produces:
  - `media.ts`: `type MediaKind = 'image' | 'video'`;
    `const MEDIA_TYPES: Record<string, { kind: MediaKind; mimeType: string }>`;
    `function splitName(file: string): { stem: string; ext: string }`;
    `function isJunkPath(path: string): boolean`.
  - `manifest.ts`: `PACK_FORMAT = 2`; `PackManifest.noMedia?: boolean`.
  - `entries.ts`: `type MediaCount = { images: number; videos: number }`;
    `type PackSummary = { media: MediaCount; hasPrompt: boolean }`;
    `type VariantSlot = 'media' | 'prompt' | 'voice' | 'colour' | 'model'`;
    `PackOption.media: MediaCount`, `PackOption.noMedia?: boolean`;
    `function totalMedia(c: MediaCount): number`;
    `function describeMedia(c: MediaCount): string`;
    `function effectiveMedia(overlay: PackOption | null, base: MediaCount): MediaCount`.
  - `prompt.ts`: `fillSharedSections(prompt, { includeMedia: boolean })`.
  - `shared-prompt.ts`: `MEDIA_SECTION` (replacing `PICTURES_SECTION`).

- [ ] **Step 1: Write the failing test for `media.ts`**

Create `src/lib/goonpacks/media.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { MEDIA_TYPES, isJunkPath, splitName } from './media';

describe('MEDIA_TYPES', () => {
  it('maps stills and videos to their kind and MIME type', () => {
    expect(MEDIA_TYPES.jpg).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    expect(MEDIA_TYPES.jpeg).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    expect(MEDIA_TYPES.png).toEqual({ kind: 'image', mimeType: 'image/png' });
    expect(MEDIA_TYPES.webp).toEqual({ kind: 'image', mimeType: 'image/webp' });
    expect(MEDIA_TYPES.mp4).toEqual({ kind: 'video', mimeType: 'video/mp4' });
    expect(MEDIA_TYPES.webm).toEqual({ kind: 'video', mimeType: 'video/webm' });
  });
  it('does not carry .mov — it is rejected by name, not accepted here', () => {
    expect(MEDIA_TYPES.mov).toBeUndefined();
  });
});

describe('splitName', () => {
  it('splits stem from a lowercased extension', () => {
    expect(splitName('Beach.JPG')).toEqual({ stem: 'Beach', ext: 'jpg' });
    expect(splitName('a.b.mp4')).toEqual({ stem: 'a.b', ext: 'mp4' });
    expect(splitName('noext')).toEqual({ stem: 'noext', ext: '' });
  });
});

describe('isJunkPath', () => {
  it('spots macOS and archive housekeeping', () => {
    expect(isJunkPath('__MACOSX/._manifest.json')).toBe(true);
    expect(isJunkPath('.DS_Store')).toBe(true);
    expect(isJunkPath('media/.DS_Store')).toBe(true);
    expect(isJunkPath('media/._beach.jpg')).toBe(true); // AppleDouble fork
    expect(isJunkPath('media/')).toBe(true); // directory entry
    expect(isJunkPath('media/beach.jpg')).toBe(false);
    expect(isJunkPath('manifest.json')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest src/lib/goonpacks/media.test.ts` Expected: FAIL —
`Cannot find module './media'`.

- [ ] **Step 3: Write `src/lib/goonpacks/media.ts`**

```ts
// The pack format's media vocabulary: what a media file may be, and what in a
// pack's file list isn't one. Shared by validation, extraction and the
// authoring build script — no I/O, no manifest knowledge.

export type MediaKind = 'image' | 'video';

// Stills and videos a pack may carry, by lowercased extension. .mov is
// deliberately absent: it plays in Safari and unreliably elsewhere, so
// accepting it yields packs that work on their author's machine and not on a
// stranger's — parsePack rejects it by name with a message saying so.
export const MEDIA_TYPES: Record<
  string,
  { kind: MediaKind; mimeType: string }
> = {
  jpg: { kind: 'image', mimeType: 'image/jpeg' },
  jpeg: { kind: 'image', mimeType: 'image/jpeg' },
  png: { kind: 'image', mimeType: 'image/png' },
  webp: { kind: 'image', mimeType: 'image/webp' },
  mp4: { kind: 'video', mimeType: 'video/mp4' },
  webm: { kind: 'video', mimeType: 'video/webm' },
};

// The stem is the thread-ref half (goonpack:<key>/<stem>) and the caption
// sidecar's name; the extension decides the kind. Extensions compare
// lowercased, stems never do — a file named Beach.JPG is media "Beach".
export function splitName(file: string): { stem: string; ext: string } {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return { stem: file, ext: '' };
  return { stem: file.slice(0, dot), ext: file.slice(dot + 1).toLowerCase() };
}

// Housekeeping entries hand-made (Finder, 7-Zip) archives accumulate, plus the
// bare directory entries a zip lists. Stripped on the way into a tree and
// ignored when reading one, so neither validation nor the media list ever sees
// them.
export function isJunkPath(path: string): boolean {
  if (path.startsWith('__MACOSX/') || path.endsWith('/')) return true;
  const base = path.split('/').pop() ?? '';
  return base === '.DS_Store' || base.startsWith('._');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/goonpacks/media.test.ts` Expected: PASS.

- [ ] **Step 5: Write the failing manifest tests**

In `src/lib/goonpacks/manifest.test.ts`, change every fixture's `format: 1` to
`format: 2`, rename every `noPictures` to `noMedia`, and add:

```ts
it('names the old layout when a format 1 pack is imported', () => {
  expect(() => parseManifest({ format: 1, id: 'a.b', version: '1' })).toThrow(
    /old pictures\/ layout/,
  );
});
it('still asks for a newer app on a future format', () => {
  expect(() => parseManifest({ format: 3, id: 'a.b', version: '1' })).toThrow(
    /newer version of the app/,
  );
});
```

Also update the existing `noPictures` expectations to the new message text:
`'noMedia is only for overlay packs — remove it from manifest.json.'` and
`'The noMedia field must be true or false (no quotes).'`

- [ ] **Step 6: Run them to confirm they fail**

Run: `npx jest src/lib/goonpacks/manifest.test.ts` Expected: FAIL — the
old-layout message doesn't exist and `format: 2` is rejected.

- [ ] **Step 7: Update `manifest.ts`**

- `export const PACK_FORMAT = 2;` — and update its comment to say what it is,
  not what it was.
- In `TOP_FIELDS`, `'noPictures'` → `'noMedia'`.
- In `PackManifest`, rename the field and reword the comment:

```ts
  // Overlay only: the resolved variant has NO media, deliberately — distinct
  // from omitting media/, which keeps the base's set.
  noMedia?: boolean;
```

- In the format checks, insert the format-1 case **before** the generic
  unrecognised-format case:

```ts
if (m.format > PACK_FORMAT) {
  throw new PackError('This pack needs a newer version of the app.');
}
// A format 1 pack is a real pack written to the pictures/ layout — say so,
// rather than letting it fail later as a pack with no media.
if (m.format === 1) {
  throw new PackError(
    'This pack uses the old pictures/ layout — rebuild it with a media/ folder and "format": 2.',
  );
}
if (m.format !== PACK_FORMAT) {
  throw new PackError(
    "This pack uses a format version this app doesn't recognise.",
  );
}
```

- Rename the `noPictures` validation block's field and messages:

```ts
if (m.noMedia !== undefined) {
  if (typeof m.noMedia !== 'boolean') {
    problems.push('The noMedia field must be true or false (no quotes).');
  }
  if (m.base === undefined) {
    problems.push(
      'noMedia is only for overlay packs — remove it from manifest.json.',
    );
  }
}
```

- And in the returned object: `noMedia: m.noMedia as boolean | undefined,`.
- Update the missing-format message to `add "format": 2.`

- [ ] **Step 8: Run the manifest tests**

Run: `npx jest src/lib/goonpacks/manifest.test.ts` Expected: PASS.

- [ ] **Step 9: Write the failing entries tests**

In `src/lib/goonpacks/entries.test.ts`:

- `format: 1` → `format: 2` in the `manifest` fixture.
- `const NO_EXTRAS = { media: { images: 0, videos: 0 }, hasPrompt: false };`
- Every `{ pictures: N, hasPrompt: X }` summary becomes
  `{ media: { images: N, videos: 0 }, hasPrompt: X }`.
- Every `pictures: N` assertion on a `PackOption` becomes
  `media: { images: N, videos: 0 }`.
- `noPictures` → `noMedia`; `changed: ['pictures', …]` →
  `changed: ['media', …]`.
- Replace the `effectivePictures` describe block with:

```ts
describe('effectiveMedia', () => {
  const none = { images: 0, videos: 0 };
  const opt = (extra: object) => ({
    key: 'pub.o@1',
    label: 'pub',
    media: none,
    changed: [],
    ...extra,
  });
  it("no overlay, or a medialess overlay, plays the base's set", () => {
    expect(effectiveMedia(null, { images: 9, videos: 1 })).toEqual({
      images: 9,
      videos: 1,
    });
    expect(effectiveMedia(opt({}), { images: 9, videos: 1 })).toEqual({
      images: 9,
      videos: 1,
    });
  });
  it("an overlay's own set wins; noMedia strips to zero", () => {
    expect(
      effectiveMedia(opt({ media: { images: 4, videos: 2 } }), {
        images: 9,
        videos: 0,
      }),
    ).toEqual({ images: 4, videos: 2 });
    expect(
      effectiveMedia(opt({ noMedia: true }), { images: 9, videos: 0 }),
    ).toEqual(none);
  });
});

describe('describeMedia', () => {
  it('names stills and videos separately, singular and plural', () => {
    expect(describeMedia({ images: 0, videos: 0 })).toBe('');
    expect(describeMedia({ images: 1, videos: 0 })).toBe('1 picture');
    expect(describeMedia({ images: 3, videos: 0 })).toBe('3 pictures');
    expect(describeMedia({ images: 0, videos: 1 })).toBe('1 video');
    expect(describeMedia({ images: 3, videos: 2 })).toBe(
      '3 pictures · 2 videos',
    );
  });
});
```

Update the imports at the top of the file to `effectiveMedia`, `describeMedia`.

- [ ] **Step 10: Run them to confirm they fail**

Run: `npx jest src/lib/goonpacks/entries.test.ts` Expected: FAIL —
`effectiveMedia`/`describeMedia` are not exported.

- [ ] **Step 11: Update `entries.ts`**

```ts
// What a pack's tree holds that the manifest can't say — the media it carries,
// split by kind (the chooser and the admin row name stills and videos
// separately), and whether it has a prompt.
export type MediaCount = { images: number; videos: number };
export type PackSummary = { media: MediaCount; hasPrompt: boolean };

export const totalMedia = (c: MediaCount): number => c.images + c.videos;

// "3 pictures · 2 videos" — one phrase, used by both the chooser card's feature
// line and the Goonpacks row, so a pack reads the same on either screen.
export function describeMedia(c: MediaCount): string {
  const parts: string[] = [];
  if (c.images > 0) {
    parts.push(`${c.images} picture${c.images === 1 ? '' : 's'}`);
  }
  if (c.videos > 0) parts.push(`${c.videos} video${c.videos === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
```

`VariantSlot`: `'pictures'` → `'media'`. `PackOption`: `pictures: number` →
`media: MediaCount`, `noPictures?: boolean` → `noMedia?: boolean` (keep the
comments, reworded for media). `changedSlots`:

```ts
if (totalMedia(p.summary.media) > 0 || p.manifest.noMedia === true) {
  out.push('media');
}
```

`effectivePictures` → `effectiveMedia`:

```ts
// The media a base+overlay selection actually plays with: the overlay's own set
// when it brings one (or deliberately none), else the base's.
export function effectiveMedia(
  overlay: PackOption | null,
  base: MediaCount,
): MediaCount {
  if (overlay === null) return base;
  if (overlay.noMedia === true) return { images: 0, videos: 0 };
  return totalMedia(overlay.media) > 0 ? overlay.media : base;
}
```

`baseOption`/`overlayOption`: `media: p.summary.media`,
`noMedia: p.manifest.noMedia`. `buildEntries`' built-in option:
`media: { images: 0, videos: 0 }` (built-ins ship medialess; the field is there
so a built-in option has the same shape as a pack's). Leave
`packToCompanion({ manifest: newest.manifest, pictures: [] })` alone —
`PackContent` keeps its `pictures` field until Task 2.

- [ ] **Step 12: Run the entries tests**

Run: `npx jest src/lib/goonpacks/entries.test.ts` Expected: PASS.

- [ ] **Step 13: Write the failing prompt test**

In `src/lib/goonpacks/prompt.test.ts`, rename the import and every use:
`PICTURES_SECTION` → `MEDIA_SECTION`, `includePictures` → `includeMedia`, and
the test name to `'fills MEDIA_SECTION only when media exists'`.

Run: `npx jest src/lib/goonpacks/prompt.test.ts` → FAIL (no `MEDIA_SECTION`).

- [ ] **Step 14: Rename the section**

In `src/lib/companions/shared-prompt.ts`, replace the `PICTURES_SECTION` export
with:

```ts
export const MEDIA_SECTION = `PICTURES AND VIDEOS:
- You can send him a picture or a short video of yourself, right there in the
  call, with the send_media tool. It lists what you have, marked picture or
  video, and what each one shows — pick the one that fits the moment and send
  it.
- Sending it is calling the tool — saying "here, look at this" in words does
  nothing on its own. So when you want him to see you, USE THE TOOL. Right
  after, you'll be told it sent, and THEN you say something about it — teasing,
  shy, telling him to look.
- Send one when it fits and feels natural — when he asks to see you, or when you
  want to show off for him — not constantly. You love showing him your body
  because you know how much he loves it, so lean into that when you do.`;
```

In `src/lib/goonpacks/prompt.ts`: import and register `MEDIA_SECTION` in
`SECTIONS`, and rename the option:

```ts
export function fillSharedSections(
  prompt: string,
  opts: { includeMedia: boolean },
): string {
  return prompt.replace(/\{\{([A-Z0-9_]+)\}\}/g, (token, name: string) => {
    if (LIVE_MARKERS.has(name)) return token;
    if (name === 'MEDIA_SECTION' && !opts.includeMedia) return '';
    return SECTIONS[name] ?? ''; // unknown tokens are dropped, per spec
  });
}
```

Run: `npx jest src/lib/goonpacks/prompt.test.ts` → PASS.

- [ ] **Step 15: Fix the remaining call sites so the tree compiles**

These are mechanical renames — no behaviour change. Media is still images-only
until Task 3, so every count goes into `images`.

`src/lib/goonpacks/pack.ts`:

- Delete the local `IMAGE_TYPES` and `isJunk`; import `MEDIA_TYPES`,
  `isJunkPath`, `splitName` from `./media` and use them. The picture branch
  becomes
  `const type = MEDIA_TYPES[ext]; if (type?.kind === 'image') { … mimeType: type.mimeType … }`
  — videos still fall through to the unsupported message here; the full media
  rules land in Task 3.
- `manifest.noPictures` → `manifest.noMedia`, message
  `'noMedia is set but the pack has a media/ folder — remove one or the other.'`
  (the folder is still read from `pictures/` until Task 3 — leave the path
  literal alone; only the manifest field and its message change here).

`src/lib/goonpacks/resolve.ts`:

- `fill(prompt, pictures)` →
  `fillSharedSections(prompt, { includeMedia: (media?.length ?? 0) > 0 })`.
- `m.noPictures` → `m.noMedia`.
- Leave `PackContent.pictures` and `CompanionPicture` alone; they change in
  Task 2.

`src/hooks/use-goonpack-library.ts`:

```ts
const summarize = (parsed: ParsedPack): PackSummary => ({
  media: { images: parsed.pictures.length, videos: 0 },
  hasPrompt: parsed.systemPrompt !== undefined,
});
```

`src/components/goonpacks-panel.tsx` — `contents()`:

```ts
const s = row.summary;
const m = row.manifest;
if (s !== undefined && describeMedia(s.media) !== '') {
  parts.push(describeMedia(s.media));
}
if (m?.noMedia === true) parts.push('no media');
```

(import `describeMedia` from `@/lib/goonpacks/entries`).

`src/components/play-modes/companions-panel/chooser-card.tsx` —
`variantFeatures`:

```ts
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
```

and at the call site: `media: effectiveMedia(overlayOpt, baseOpt.media)`.

`src/lib/goonpacks/pack.test.ts` and `resolve.test.ts`: change fixture
`format: 1` → `format: 2` and `noPictures` → `noMedia` so they still pass.
`resolve.test.ts` also needs its `PICTURES_SECTION` import renamed to
`MEDIA_SECTION` and the prompt fixtures' `{{PICTURES_SECTION}}` token changed to
`{{MEDIA_SECTION}}`.

- [ ] **Step 16: Run the full gate**

```bash
npm test && npm run typecheck && npm run lint && npm run format
```

Expected: all tests pass; typecheck and lint print nothing.

- [ ] **Step 17: Commit**

```bash
git add -A
git commit -m "Goonpacks: media vocabulary and pack format 2"
```

---

## Task 2: Videos in the companion's media set

Give a companion's media a kind and a lazily-resolved URL, and render a video as
a `<video>`. Storage is still zips; the library fills `src` eagerly and `load()`
just hands it back, so the render path is finished here and never touched again
when OPFS lands.

**Files:**

- Create: `src/hooks/use-media-url.ts`
- Create: `src/components/play-modes/companions-panel/media-bubble.tsx`
- Delete: `src/components/play-modes/companions-panel/picture-bubble.tsx`
- Rename: `missing-picture-bubble.tsx` → `missing-media-bubble.tsx`
- Modify: `src/lib/companions/companions.ts:18-49`
- Modify: `src/lib/goonpacks/resolve.ts`
- Modify: `src/lib/companions/tools.ts:6-12`
- Modify: `src/lib/companions/conversation.ts:26-38`
- Modify: `src/hooks/use-voice-session.ts:648-662`
- Modify: `src/hooks/use-goonpack-library.ts` (`loadContent`)
- Modify: `src/components/play-modes/companions-panel/index.tsx`
- Modify: `src/components/play-modes/companions-panel/lightbox.tsx`
- Test: `src/lib/goonpacks/resolve.test.ts`

**Interfaces:**

- Consumes: `MediaKind` from Task 1's `src/lib/goonpacks/media.ts`.
- Produces:
  - `companions.ts`:
    `type CompanionMedia = { kind: MediaKind; description: string; ref: string; src?: string; load(): Promise<string> }`;
    `Companion.media?: CompanionMedia[]`.
  - `resolve.ts`:
    `PackContent = { manifest: PackManifest; systemPrompt?: string; media: CompanionMedia[] }`;
    `function resolveMediaRef(ref: string, media: CompanionMedia[] | undefined): CompanionMedia | null`.
  - `use-media-url.ts`:
    `function useMediaUrl(media: CompanionMedia | null): string | null`.
  - `media-bubble.tsx`:
    `function MediaBubble({ media, onOpen }: { media: CompanionMedia; onOpen: () => void })`.
  - `tools.ts`: `type ToolRunResult = { result: string; mediaRef?: string }`.
  - `conversation.ts`: the tool turn's `imageSrc?: string` becomes
    `mediaRef?: string`;
    `appendTool(thread, name, result, toolCallId, mediaRef?, at?)` keeps its
    positional shape.

- [ ] **Step 1: Write the failing resolve test**

In `src/lib/goonpacks/resolve.test.ts`, replace the `resolvePictureRef` describe
block with:

```ts
describe('resolveMediaRef', () => {
  const media: CompanionMedia[] = [
    {
      kind: 'image',
      description: 'd',
      ref: 'goonpack:g00ner.aimee@1.0.0/1',
      src: 'blob:live',
      load: () => Promise.resolve('blob:live'),
    },
  ];
  it('resolves a matching ref to its entry', () => {
    expect(resolveMediaRef('goonpack:g00ner.aimee@1.0.0/1', media)).toBe(
      media[0],
    );
  });
  it('returns null when the same name lives in a different pack', () => {
    expect(resolveMediaRef('goonpack:other.pack@1/1', media)).toBeNull();
  });
  it('never resolves a pre-goonpacks path ref', () => {
    expect(resolveMediaRef('/companions/aimee/x.jpg', media)).toBeNull();
  });
  it('returns null for a companion with no media', () => {
    expect(resolveMediaRef('goonpack:a.b@1/1', undefined)).toBeNull();
  });
});
```

Also update the overlay fixtures in that file: `pictures` → `media`, and each
`{ src: 'blob:x', description: 'd' }` becomes a full `CompanionMedia`:

```ts
const still = (src: string): CompanionMedia => ({
  kind: 'image',
  description: 'd',
  ref: `goonpack:test.pack@1/${src}`,
  src,
  load: () => Promise.resolve(src),
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest src/lib/goonpacks/resolve.test.ts` Expected: FAIL —
`resolveMediaRef` is not exported.

- [ ] **Step 3: Reshape `CompanionMedia`**

In `src/lib/companions/companions.ts`, replace `CompanionPicture`:

```ts
// One thing a companion can send: a still or a video. `description` is what the
// model reads to pick a fitting one, from the pack's <basename>.txt sidecar, or
// "" when there's none. `ref` is the thread-stable reference — object URLs die
// with the session, so a sent item persists as `ref` and rendering resolves it
// against whatever's currently loaded. `src` is that object URL once it exists:
// `load()` mints it on first render (a pack's media is thousands of files, most
// of which are never shown) and memoises it here, and it stays alive as long as
// this entry does.
export type CompanionMedia = {
  kind: MediaKind;
  description: string;
  ref: string;
  src?: string;
  load(): Promise<string>;
};
```

Import `MediaKind` from `@/lib/goonpacks/media`. Rename `Companion.pictures` to
`Companion.media` and reword its comment for media.

- [ ] **Step 4: Update `resolve.ts`**

- `PackContent.pictures` → `media: CompanionMedia[]`.
- `fill(prompt, media)` reads `media.length`.
- `packToCompanionRaw`:
  `const media = pack.media.length > 0 ? pack.media : undefined;` and `media,`
  in the returned object.
- `applyOverlay`: the `noMedia`/overlay-media/base-media three-way, unchanged in
  shape.
- Replace `resolvePictureRef`:

```ts
// A thread's persisted media ref → the live entry, or null when the referenced
// item isn't in the loaded set (render a placeholder — never a substitute).
// Pre-goonpacks threads stored raw paths; those never resolve either — the files
// they point at are gone.
export function resolveMediaRef(
  ref: string,
  media: CompanionMedia[] | undefined,
): CompanionMedia | null {
  return media?.find((m) => m.ref === ref) ?? null;
}
```

Run: `npx jest src/lib/goonpacks/resolve.test.ts` → PASS.

- [ ] **Step 5: Rename the tool turn's field**

`src/lib/companions/tools.ts`:

```ts
// What a tool's `run` may return. A plain string is the common case (the result
// text logged + fed back to the model). The object form lets a tool also attach
// a still or video to the transcript turn (send_media): `result` is the
// model-facing text, `mediaRef` the stable reference the transcript renders and
// the lightbox opens.
export type ToolRunResult = { result: string; mediaRef?: string };
```

`src/lib/companions/conversation.ts`: rename `imageSrc` to `mediaRef` on the
tool turn and in `appendTool`'s parameter list, and reword the comment ("the
still or video the transcript renders inline…").

`src/hooks/use-voice-session.ts:648-662`: rename the local and the comment.

```ts
// run() returns either the result string or a { result, mediaRef }
// object (send_media): normalise to both. mediaRef rides onto the
// tool turn for rendering; only `result` is fed to the model.
const raw = tool === undefined ? 'unknown tool' : tool.run(args);
const result = typeof raw === 'string' ? raw : raw.result;
const mediaRef = typeof raw === 'string' ? undefined : raw.mediaRef;
```

- [ ] **Step 6: Write `use-media-url.ts`**

```ts
'use client';
// A media entry's object URL, minted on first use. The entry memoises the URL
// on itself, so a re-render (or a second bubble showing the same item) is
// synchronous from then on — the null return is only ever the very first paint.

import { useEffect, useState } from 'react';
import type { CompanionMedia } from '@/lib/companions/companions';

export function useMediaUrl(media: CompanionMedia | null): string | null {
  const [src, setSrc] = useState<string | null>(media?.src ?? null);
  useEffect(() => {
    if (media === null) {
      setSrc(null);
      return;
    }
    if (media.src !== undefined) {
      setSrc(media.src);
      return;
    }
    let live = true;
    void media.load().then(
      (url) => {
        if (live) setSrc(url);
      },
      () => {
        // The file is gone from storage — render the placeholder rather than a
        // broken element.
        if (live) setSrc(null);
      },
    );
    return () => {
      live = false;
    };
  }, [media]);
  return src;
}
```

- [ ] **Step 7: Write `media-bubble.tsx` and rename the placeholder**

`src/components/play-modes/companions-panel/media-bubble.tsx`:

```tsx
'use client';

// Something the companion sent, inline in the transcript — left-aligned like
// their bubbles. A still is a thumbnail; a video plays inline, muted and looping,
// as its own preview. Either one opens full-size in the lightbox on click.

import Image from 'next/image';
import type { CompanionMedia } from '@/lib/companions/companions';
import { useMediaUrl } from '@/hooks/use-media-url';
import { MissingMediaBubble } from './missing-media-bubble';

export function MediaBubble({
  media,
  onOpen,
}: {
  media: CompanionMedia;
  onOpen: () => void;
}) {
  const src = useMediaUrl(media);
  if (src === null) return <MissingMediaBubble />;
  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={onOpen}
        aria-label={media.kind === 'video' ? 'Open video' : 'Open picture'}
        className="ring-foreground/10 relative h-44 w-44 overflow-hidden rounded-2xl ring-1 transition hover:opacity-90"
      >
        {media.kind === 'video' ? (
          <video
            src={src}
            muted
            loop
            autoPlay
            playsInline
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <Image src={src} alt="" fill sizes="176px" className="object-cover" />
        )}
      </button>
    </div>
  );
}
```

Rename `missing-picture-bubble.tsx` to `missing-media-bubble.tsx`, the component
to `MissingMediaBubble`, and its text to `Media from another pack.`; reword the
comment to "A still or video from a pack that isn't loaded right now — never
substitute." Delete `picture-bubble.tsx`.

```bash
git mv src/components/play-modes/companions-panel/missing-picture-bubble.tsx \
       src/components/play-modes/companions-panel/missing-media-bubble.tsx
git rm src/components/play-modes/companions-panel/picture-bubble.tsx
```

- [ ] **Step 8: Teach the lightbox about videos**

In `lightbox.tsx`, take `media: CompanionMedia` in place of `src: string`,
resolve it with `useMediaUrl`, and render a `<video controls autoPlay loop>` for
a video. Keep the enter/exit animation, the badge and the Escape handling
exactly as they are; the effect that resets `closing` keys on `media` instead of
`src`. Render nothing (`return null`) while the URL is still resolving.

```tsx
export function Lightbox({
  media,
  stage,
  onClose,
}: {
  media: CompanionMedia;
  stage: VoiceStage;
  onClose: () => void;
}) {
  const src = useMediaUrl(media);
  // …unchanged state/effects, with [media] in place of [src]…
  if (src === null) return null;
  // …and in the inner animated div:
  //   {media.kind === 'video' ? (
  //     <video src={src} controls autoPlay loop playsInline
  //       className="absolute inset-0 size-full object-contain" />
  //   ) : (
  //     <Image src={src} alt="" fill sizes="92vw" priority className="object-contain" />
  //   )}
}
```

Note: the hooks must all run before the `if (src === null) return null` early
return — put it immediately before the returned JSX, after every `useEffect`.

- [ ] **Step 9: Rename the tool and wire the panel**

In `src/components/play-modes/companions-panel/index.tsx`:

- `const [lightboxMedia, setLightboxMedia] = useState<CompanionMedia | null>(null);`
  and
  `const showMedia = useCallback((m: CompanionMedia) => setLightboxMedia(m), []);`
- `const items = companion.media ?? [];` in the `tools` memo, with
  `companion.media` in the dependency array.
- The tool becomes:

```ts
      ...(items.length > 0
        ? [
            {
              name: 'send_media',
              description:
                'Send him a picture or a video of yourself, shown to him right now in the call. Pass `which` — the number of the one to send. Optionally pass `kind` to say which sort you mean; the call is refused if it disagrees with the number. What you can send:\n' +
                items
                  .map(
                    (m, i) =>
                      `${i + 1} — (${m.kind === 'video' ? 'video' : 'picture'}) ${m.description}`,
                  )
                  .join('\n'),
              parameters: {
                type: 'object',
                properties: {
                  which: {
                    type: 'integer',
                    minimum: 1,
                    maximum: items.length,
                    description: 'the number of the one to send',
                  },
                  kind: {
                    type: 'string',
                    enum: ['picture', 'video'],
                    description:
                      'optional: the sort you mean to send, checked against the number',
                  },
                },
                required: ['which'],
              },
              run: (args: Record<string, unknown>) => {
                const n = args.which;
                const idx =
                  typeof n === 'number' && Number.isFinite(n)
                    ? Math.min(Math.max(Math.round(n), 1), items.length) - 1
                    : 0;
                const item = items[idx]!;
                const named = item.kind === 'video' ? 'video' : 'picture';
                // `kind` is a stated intent, not a filter — the list is one
                // numbering over everything. Refusing a mismatch turns a
                // misread number into a correction the companion can act on,
                // rather than the wrong thing arriving on his screen.
                const wanted = args.kind;
                if (typeof wanted === 'string' && wanted !== named) {
                  return `number ${idx + 1} is a ${named}, not a ${wanted} — check the list and pick again`;
                }
                showMedia(item);
                return {
                  result: `Sent him the ${named}: ${item.description}`,
                  mediaRef: item.ref,
                };
              },
            } satisfies CompanionTool,
          ]
        : []),
```

- The transcript branch:

```tsx
                      if (turn.mediaRef !== undefined) {
                        const item = resolveMediaRef(
                          turn.mediaRef,
                          companion.media,
                        );
                        row =
                          item === null ? (
                            <MissingMediaBubble />
                          ) : (
                            <MediaBubble
                              media={item}
                              onOpen={() => showMedia(item)}
                            />
                          );
                      } else {
```

- The lightbox mount:
  `{lightboxMedia !== null && (<Lightbox media={lightboxMedia} stage={…} onClose={() => setLightboxMedia(null)} />)}`.
- Update the imports (`resolveMediaRef`, `MediaBubble`, `MissingMediaBubble`,
  `CompanionMedia`) and the comments that say "picture".

- [ ] **Step 10: Adapt the (still zip-based) library hook**

In `src/hooks/use-goonpack-library.ts`, `loadContent` now builds
`CompanionMedia` with the URL already in hand — `load()` is a formality until
Task 3 replaces this file:

```ts
    media: parsed.pictures.map((p) => {
      const src = URL.createObjectURL(
        new Blob([p.bytes.buffer as ArrayBuffer], { type: p.mimeType }),
      );
      collect?.push(src);
      return {
        kind: 'image' as const,
        description: p.description,
        ref: `goonpack:${key}/${p.name}`,
        src,
        load: () => Promise.resolve(src),
      };
    }),
```

and `resolveVariant`'s winning-set line becomes
`const winning = new Set((companion.media ?? []).map((m) => m.src!));`.

- [ ] **Step 11: Run the gate**

```bash
npm test && npm run typecheck && npm run lint && npm run format
```

Expected: all green.

- [ ] **Step 12: Hand over for browser verification**

**Your human partner runs this**, not you — it needs pack content that isn't in
the repo. Report that the task is done and say what to look for: `npm run dev`,
open the app, import a pack zip with a couple of images, pick the companion, and
confirm the chooser card and Goonpacks row read "N pictures". `send_media`
itself can't be exercised without a live LLM — the transcript path is covered by
typecheck and by the e2e in Task 3.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Companions: media entries carry a kind and a lazy URL; videos render as video"
```

---

## Task 3: Switch the pack path to OPFS

One atomic switch: validation stops taking zip bytes, storage stops being
IndexedDB, and the library stops re-inflating anything. It is deliberately one
task — split any smaller and the halves only compile with throwaway adapters
between them.

**Four phases, in order.** Each ends in its own commit, so the task's history
reads as four reviewable steps. **The gates run once, at the end of Phase D** —
`npm run typecheck` does not pass in the middle of this task, because Phase A
changes `parsePack`'s signature and Phase D is what updates its last caller. Do
not invent adapters to make an intermediate phase compile; that is exactly what
this task exists to avoid.

**Files:**

- Rewrite: `src/lib/goonpacks/pack.ts`, `src/lib/goonpacks/pack.test.ts`
- Rewrite: `src/lib/goonpacks/store.ts` (IndexedDB out, OPFS in)
- Rewrite: `src/hooks/use-goonpack-library.ts`
- Create: `src/lib/goonpacks/library.ts`, `src/lib/goonpacks/library.test.ts`
- Create: `src/lib/goonpacks/extract.ts`, `src/lib/goonpacks/import.ts`
- Create: `tests/e2e/goonpack-storage.spec.ts`
- Modify: `src/components/goonpacks-panel.tsx`,
  `tests/e2e/goonpack-import.spec.ts`
- Modify: `scripts/goonpack-build.ts`, `scripts/describe-missing.mjs`,
  `scripts/describe-image.mjs` (comments only), `.gitignore`, `tsconfig.json`

**Interfaces:**

- Consumes: `MEDIA_TYPES`, `splitName`, `isJunkPath`
  (`src/lib/goonpacks/media.ts`); `parseManifest`, `PackError`
  (`src/lib/goonpacks/manifest.ts`); `CompanionMedia`
  (`src/lib/companions/companions.ts`); `PackContent`, `applyOverlay`,
  `packToCompanion`, `packToCompanionRaw`, `resolveDefault`
  (`src/lib/goonpacks/resolve.ts`) — all from Tasks 1 and 2.
- Produces:
  - `pack.ts`:
    `type PackTree = { names: string[]; readText(path: string): Promise<string> }`;
    `type ParsedMedia = { name: string; file: string; kind: MediaKind; mimeType: string; description: string }`;
    `type ParsedPack = { manifest: PackManifest; systemPrompt?: string; media: ParsedMedia[] }`;
    `function parsePack(tree: PackTree): Promise<ParsedPack>`;
    `function peekManifest(raw: string): PackPeek` (replaces `peekPack`);
    `const MEDIA_DIR = 'media/'`, `const MANIFEST = 'manifest.json'`,
    `const PROMPT = 'system-prompt.md'`.
  - `store.ts`, `library.ts`, `extract.ts`, `import.ts`: listed at each phase
    below.
- Later tasks rely on: `extractZip` (Task 4 moves its call into a worker).

### Phase A — validate a pack as a tree of names

`parsePack` stops taking inflated zip bytes and becomes an async pass over a
listing of names plus a text reader. Media is never read. The authoring build
script gets the first real tree implementation (node fs).

**This phase also amends Task 1's format gate.** Formats 1 and 2 differ in
exactly two things: the media folder's name, and `noPictures` vs `noMedia`. A
format-1 pack that uses neither — the pictureless example pack, any voice-only
or colour-only overlay — is byte-for-byte a format-2 pack, so it is accepted
rather than told to rebuild. One that uses either is rejected, with the
old-layout message. That splits the check by where its evidence lives: the
`noPictures` half stays in `parseManifest`, the `pictures/` half is a tree fact
and moves here.

- [ ] **Step 0: Amend the format gate in `manifest.ts`**

Export the message so `parsePack` can raise the same one:

```ts
// Formats 1 and 2 differ only in the media folder's name and this field, so
// this is what "written for the old format" concretely means.
export const OLD_LAYOUT_PROBLEM =
  'This pack uses the old pictures/ layout — rebuild it with a media/ folder and "format": 2.';
```

Replace Task 1's unconditional format-1 throw with:

```ts
if (m.format > PACK_FORMAT) {
  throw new PackError('This pack needs a newer version of the app.');
}
if (m.format !== PACK_FORMAT && m.format !== 1) {
  throw new PackError(
    "This pack uses a format version this app doesn't recognise.",
  );
}
// A format 1 pack that used noPictures is genuinely written to the old
// format; one that didn't may still be a format 2 pack in every respect,
// which only the tree can say — parsePack finishes the judgement.
if (m.format === 1 && m.noPictures !== undefined) {
  throw new PackError(OLD_LAYOUT_PROBLEM);
}
```

Leave `TOP_FIELDS` alone: a **format 2** manifest carrying `noPictures` still
reports it as an unknown top-level field, which is the right message for a typo.

Add to `src/lib/goonpacks/manifest.test.ts`, replacing Task 1's
`names the old layout when a format 1 pack is imported` case:

```ts
it('accepts a format 1 manifest that used no old-format feature', () => {
  expect(
    parseManifest({
      format: 1,
      id: 'a.b',
      version: '1',
      aboutThePack: 'x',
      base: 'autogoon.aimee',
    }).format,
  ).toBe(1);
});
it('names the old layout when a format 1 pack used noPictures', () => {
  expect(() =>
    parseManifest({
      format: 1,
      id: 'a.b',
      version: '1',
      aboutThePack: 'x',
      base: 'autogoon.aimee',
      noPictures: true,
    }),
  ).toThrow(/old pictures\/ layout/);
});
```

- [ ] **Step 1: Write the failing pack tests**

Replace `src/lib/goonpacks/pack.test.ts` wholesale:

```ts
import { describe, expect, it } from '@jest/globals';
import { PackError } from './manifest';
import { parsePack, peekManifest, type PackTree } from './pack';

const manifest = (extra: object = {}) =>
  JSON.stringify({
    format: 2,
    id: 'test.pack',
    version: '1.0.0',
    aboutThePack: 'a test pack',
    ...extra,
  });
const complete = (extra: object = {}) =>
  manifest({ companion: { name: 'Testy', voiceId: 'v123' }, ...extra });

// An in-memory PackTree: file contents by path. Media files hold '' — parsePack
// must never read them, and a test that made it read one would still pass on
// content but is caught by the "never reads media" test below.
function tree(files: Record<string, string>): PackTree & { read: string[] } {
  const read: string[] = [];
  return {
    names: Object.keys(files),
    read,
    readText: (path: string) => {
      read.push(path);
      const v = files[path];
      if (v === undefined) return Promise.reject(new Error(`no ${path}`));
      return Promise.resolve(v);
    },
  };
}

describe('parsePack', () => {
  it('parses a complete pack with stills, videos and captions', async () => {
    const t = tree({
      'manifest.json': complete(),
      'system-prompt.md': 'You are Testy.',
      'media/a.jpg': '',
      'media/a.txt': 'desc a\n',
      'media/b.png': '',
      'media/c.mp4': '',
      'media/c.txt': 'a video',
    });
    const pack = await parsePack(t);
    expect(pack.manifest.id).toBe('test.pack');
    expect(pack.systemPrompt).toBe('You are Testy.');
    expect(pack.media).toHaveLength(3);
    expect(pack.media[0]).toEqual({
      name: 'a',
      file: 'a.jpg',
      kind: 'image',
      mimeType: 'image/jpeg',
      description: 'desc a',
    });
    expect(pack.media[1]).toMatchObject({ name: 'b', description: '' });
    expect(pack.media[2]).toMatchObject({
      name: 'c',
      kind: 'video',
      mimeType: 'video/mp4',
      description: 'a video',
    });
  });

  it('never reads a media file', async () => {
    const t = tree({
      'manifest.json': complete(),
      'system-prompt.md': 'x',
      'media/a.jpg': '',
      'media/a.txt': 'cap',
      'media/big.mp4': '',
    });
    await parsePack(t);
    expect(t.read.sort()).toEqual([
      'manifest.json',
      'media/a.txt',
      'system-prompt.md',
    ]);
  });

  it('accepts an overlay with nothing but a manifest', async () => {
    const pack = await parsePack(
      tree({ 'manifest.json': manifest({ base: 'autogoon.aimee' }) }),
    );
    expect(pack.media).toEqual([]);
  });

  it('rejects .mov by name, saying why', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/video.mov': '',
    });
    await expect(parsePack(t)).rejects.toThrow(/\.mov/);
    await expect(parsePack(t)).rejects.toThrow(/mp4 or \.webm/);
  });

  it('rejects unsupported files and subfolders under media/', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/a.gif': '',
      'media/sub/b.jpg': '',
    });
    const problems = await parsePack(t).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, with captions in matching .txt files.',
      "media/ can't contain subfolders — found media/sub/b.jpg.",
    ]);
  });

  it('rejects duplicate stems across extensions', async () => {
    const t = tree({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'media/a.jpg': '',
      'media/a.mp4': '',
    });
    await expect(parsePack(t)).rejects.toThrow(/share the name/);
  });

  it('rejects noMedia alongside a media/ folder', async () => {
    await expect(
      parsePack(
        tree({
          'manifest.json': manifest({
            base: 'autogoon.aimee',
            noMedia: true,
          }),
          'media/a.jpg': '',
        }),
      ),
    ).rejects.toThrow(/noMedia/);
    const clean = await parsePack(
      tree({
        'manifest.json': manifest({ base: 'autogoon.aimee', noMedia: true }),
      }),
    );
    expect(clean.manifest.noMedia).toBe(true);
  });

  it('rejects a complete pack missing prompt/name/voiceId', async () => {
    await expect(
      parsePack(tree({ 'manifest.json': complete() })),
    ).rejects.toThrow(/system-prompt/);
    await expect(
      parsePack(
        tree({
          'manifest.json': manifest({ companion: { voiceId: 'v' } }),
          'system-prompt.md': 'x',
        }),
      ),
    ).rejects.toThrow(PackError);
  });

  it('accepts a format 1 pack that carries no media', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': JSON.stringify({
          format: 1,
          id: 'test.pack',
          version: '1.0.0',
          aboutThePack: 'a colour-only overlay',
          base: 'autogoon.aimee',
          companion: { accentColour: 'cyan' },
        }),
      }),
    );
    expect(pack.media).toEqual([]);
  });

  it('names the old layout when a format 1 pack has a pictures/ folder', async () => {
    const t = tree({
      'manifest.json': JSON.stringify({
        format: 1,
        id: 'test.pack',
        version: '1.0.0',
        aboutThePack: 'an old pack',
        base: 'autogoon.aimee',
      }),
      'pictures/a.jpg': '',
      'pictures/a.txt': 'cap',
    });
    await expect(parsePack(t)).rejects.toThrow(/old pictures\/ layout/);
  });

  it('names the folder when everything landed inside one', async () => {
    const t = tree({
      'yourpack/manifest.json': complete(),
      'yourpack/media/a.jpg': '',
    });
    await expect(parsePack(t)).rejects.toThrow(
      /Everything is inside yourpack\//,
    );
  });

  it('asks for a root manifest when there is none and no single wrapper', async () => {
    await expect(
      parsePack(tree({ 'a/manifest.json': complete(), 'b/x.txt': '' })),
    ).rejects.toThrow(/No manifest.json at the pack root/);
  });

  it('ignores junk and extra files at the root', async () => {
    const pack = await parsePack(
      tree({
        'manifest.json': manifest({ base: 'autogoon.aimee' }),
        'readme.txt': 'hello',
        '.DS_Store': '',
        '__MACOSX/._manifest.json': '',
        'media/.DS_Store': '',
        'media/._a.jpg': '',
      }),
    );
    expect(pack.media).toEqual([]);
  });

  it('collects every problem it can determine in one throw', async () => {
    const problems = await parsePack(
      tree({
        'manifest.json': manifest({ companion: { name: 'Testy' } }),
        'media/a.gif': '',
      }),
    ).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, with captions in matching .txt files.',
      'A complete pack needs a system-prompt.md file.',
      'A complete pack needs a voiceId field in the companion section of manifest.json.',
    ]);
  });

  it("reports the manifest's own problems alongside the tree's", async () => {
    const problems = await parsePack(
      tree({
        'manifest.json': manifest({
          version: undefined,
          companion: { name: 'Testy' },
        }),
        'media/a.gif': '',
      }),
    ).catch((e: PackError) => e.problems);
    expect(problems).toEqual([
      'manifest.json is missing the version field - this is the version number of your pack',
      'Unsupported file in media/: a.gif — media must be jpg, jpeg, png, webp, mp4 or webm, with captions in matching .txt files.',
    ]);
  });
});

describe('peekManifest', () => {
  it("reads the manifest's string fields from text parsePack rejects", () => {
    expect(
      peekManifest(
        JSON.stringify({
          id: 'test.pack',
          version: '0.9.0',
          companion: { name: 'Testy' },
          base: 'autogoon.aimee',
          format: 'bad',
        }),
      ),
    ).toEqual({
      name: 'Testy',
      version: '0.9.0',
      base: 'autogoon.aimee',
    });
  });
  it('ignores non-string fields and unreadable input', () => {
    // A top-level name (the pre-companion-section shape) still peeks.
    expect(peekManifest(JSON.stringify({ version: 2, name: 'Testy' }))).toEqual(
      {
        name: 'Testy',
      },
    );
    expect(peekManifest('nope')).toEqual({});
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx jest src/lib/goonpacks/pack.test.ts` Expected: FAIL — `parsePack`
still takes bytes and `peekManifest` doesn't exist.

- [ ] **Step 3: Rewrite `pack.ts`**

```ts
// A pack's tree → ParsedPack. Validation is a pass over NAMES: permitted
// extensions, no subfolders, no stem collisions, caption pairing and the
// complete-vs-overlay completeness rules are all name rules, so only
// manifest.json, system-prompt.md and the captions are ever read. Validating a
// multi-gigabyte pack costs a few hundred kilobytes.
import {
  OLD_LAYOUT_PROBLEM,
  PackError,
  parseManifest,
  type PackManifest,
} from './manifest';
import { isJunkPath, splitName, MEDIA_TYPES, type MediaKind } from './media';

export const MANIFEST = 'manifest.json';
export const PROMPT = 'system-prompt.md';
export const MEDIA_DIR = 'media/';

// What a pack looks like to validation: the file names it holds (relative to
// the pack root, '/'-separated) and a way to read one as text. OPFS backs it in
// the app; node fs backs it in the authoring build script; a plain object backs
// it in the tests.
export type PackTree = {
  names: string[];
  readText(path: string): Promise<string>;
};

// One still or video. `name` is the stem — the thread ref's second half and the
// caption sidecar's name; `file` is the file inside media/, which is what
// actually gets opened when the item is first rendered.
export type ParsedMedia = {
  name: string;
  file: string;
  kind: MediaKind;
  mimeType: string;
  description: string;
};

export type ParsedPack = {
  manifest: PackManifest;
  systemPrompt?: string;
  media: ParsedMedia[];
};

// Best-effort look at a manifest that failed validation, so the admin row can
// still say what the pack claims to be (name, version, what it overlays).
// String fields are taken at face value — this describes, never validates;
// anything unreadable just comes back empty.
export type PackPeek = {
  name?: string;
  version?: string;
  base?: string;
  aboutThePack?: string;
};

export function peekManifest(raw: string): PackPeek {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const m = parsed as Record<string, unknown>;
    const peek: PackPeek = {};
    for (const k of ['version', 'base', 'aboutThePack'] as const) {
      const v = m[k];
      if (typeof v === 'string') peek[k] = v;
    }
    // The name sits in the companion section (leniently: or top-level, as a
    // pre-restructure manifest would have it).
    const c = m.companion;
    const name =
      typeof c === 'object' && c !== null && !Array.isArray(c)
        ? (c as Record<string, unknown>).name
        : m.name;
    if (typeof name === 'string') peek.name = name;
    return peek;
  } catch {
    return {};
  }
}

// The one structural fault worth naming: everything landed under a single
// top-level folder because the folder was zipped instead of its contents.
function wrapperFolder(names: string[]): string | null {
  const tops = new Set<string>();
  for (const n of names) {
    const slash = n.indexOf('/');
    if (slash === -1) return null; // a file at the root — not wrapped
    tops.add(n.slice(0, slash));
  }
  const only = [...tops];
  return only.length === 1 ? only[0]! : null;
}

// Like parseManifest, parsePack reports every problem it can determine in one
// throw: the manifest's problems plus the tree-level ones. Only a tree with no
// root manifest fails alone.
export async function parsePack(tree: PackTree): Promise<ParsedPack> {
  const names = tree.names.filter((n) => !isJunkPath(n));

  if (!names.includes(MANIFEST)) {
    const wrapper = wrapperFolder(names);
    throw new PackError(
      wrapper !== null
        ? `Everything is inside ${wrapper}/ — zip the folder's contents, not the folder.`
        : "No manifest.json at the pack root — zip the pack folder's contents, not the folder.",
    );
  }

  const problems: string[] = [];
  let manifest: PackManifest | undefined;
  try {
    manifest = parseManifest(JSON.parse(await tree.readText(MANIFEST)));
  } catch (e) {
    if (e instanceof PackError) problems.push(...e.problems);
    else
      problems.push(
        "manifest.json isn't valid JSON — check for missing quotes or commas.",
      );
  }

  const systemPrompt = names.includes(PROMPT)
    ? await tree.readText(PROMPT)
    : undefined;

  const media: ParsedMedia[] = [];
  const captions: string[] = [];
  const sidecars = new Map<string, string>();
  for (const path of names) {
    if (!path.startsWith(MEDIA_DIR)) continue;
    const file = path.slice(MEDIA_DIR.length);
    if (file.includes('/')) {
      problems.push(`media/ can't contain subfolders — found ${path}.`);
      continue;
    }
    const { stem, ext } = splitName(file);
    if (ext === 'txt') {
      captions.push(path);
      continue;
    }
    if (ext === 'mov') {
      problems.push(
        `${file} is a .mov — videos must be .mp4 or .webm, which play everywhere; .mov doesn't.`,
      );
      continue;
    }
    const type = MEDIA_TYPES[ext];
    if (type === undefined) {
      problems.push(
        `Unsupported file in media/: ${file} — media must be jpg, jpeg, png, webp, mp4 or webm, with captions in matching .txt files.`,
      );
      continue;
    }
    media.push({
      name: stem,
      file,
      kind: type.kind,
      mimeType: type.mimeType,
      description: '',
    });
  }
  // Captions are the only media-folder files read, and only after the name
  // rules have run — a tree that fails them is never worth the reads.
  for (const path of captions) {
    sidecars.set(
      splitName(path.slice(MEDIA_DIR.length)).stem,
      (await tree.readText(path)).trim(),
    );
  }

  const stems = new Set<string>();
  for (const m of media) {
    // Different extensions, same stem (a.jpg + a.mp4) would collide to one
    // thread ref (goonpack:<key>/a) — reject at import, not silently drop.
    if (stems.has(m.name)) {
      problems.push(
        `Two media files share the name ${m.name} — same name with different file types; rename one.`,
      );
    }
    stems.add(m.name);
    m.description = sidecars.get(m.name) ?? '';
  }
  media.sort((a, b) => a.name.localeCompare(b.name));

  // Completeness rules need a readable manifest to know overlay from complete —
  // without one, the manifest's own problems already tell the story.
  if (manifest !== undefined) {
    // The tree half of the format gate (parseManifest holds the other):
    // formats 1 and 2 differ only in this folder's name and noPictures, so a
    // format 1 pack with neither is a format 2 pack and passes. With a
    // pictures/ folder it is genuinely old, and says so rather than reporting
    // no media.
    if (manifest.format === 1 && names.some((n) => n.startsWith('pictures/'))) {
      problems.push(OLD_LAYOUT_PROBLEM);
    }
    if (manifest.base === undefined) {
      if (systemPrompt === undefined) {
        problems.push('A complete pack needs a system-prompt.md file.');
      }
      if (!manifest.companion.name) {
        problems.push(
          'A complete pack needs a name field in the companion section of manifest.json.',
        );
      }
      if (!manifest.companion.voiceId) {
        problems.push(
          'A complete pack needs a voiceId field in the companion section of manifest.json.',
        );
      }
    }
    if (manifest.noMedia === true && media.length > 0) {
      problems.push(
        'noMedia is set but the pack has a media/ folder — remove one or the other.',
      );
    }
  }
  if (problems.length > 0 || manifest === undefined) {
    throw new PackError(problems);
  }
  return { manifest, systemPrompt, media };
}
```

The description assignment moved into the stem loop, so it happens once per
entry — the `media.sort` afterwards keeps output order stable regardless.

- [ ] **Step 4: Run the pack tests**

Run: `npx jest src/lib/goonpacks/pack.test.ts` Expected: PASS.

- [ ] **Step 6: Move the build script to `media/`**

In `scripts/goonpack-build.ts`:

- Replace the `pictures` readdir block:

```ts
try {
  for (const f of readdirSync(join(dir, 'media')).sort()) {
    if (isJunkPath(f)) continue;
    add(join('media', f));
  }
} catch {
  /* no media dir */
}
```

(import `isJunkPath` from `../src/lib/goonpacks/media`; `join` on the zip path
is fine — the script runs on POSIX paths.)

- Validate the **source directory** rather than the zip, via a node-fs
  `PackTree`. The `files` record is already built for zipping, so its keys are
  the tree's names — no second walk. Replace the `parsePack(zip)` call with:

```ts
  // The pack source as a PackTree — the same name-level validation the app runs
  // over an extracted tree, so a pack that builds is a pack that imports.
  const tree: PackTree = {
    names: Object.keys(files),
    readText: (path) => Promise.resolve(readFileSync(join(dir, path), 'utf8')),
  };
  try {
    await parsePack(tree);
  } catch (e) {
    …unchanged error reporting…
  }
```

Import `type PackTree` alongside `parsePack` from `../src/lib/goonpacks/pack`.

The script's top level is an ES module, so top-level `await` works with `tsx`.
Move the per-pack body into an `async` IIFE or make the loop body `await`-ing at
the top level — top-level `await` inside a `for` loop is valid in an ESM file,
so just add `await` and update the `parsePack` import.

- Update the file's header comment: it validates the pack **source** with the
  app's own checks before zipping.

- [ ] **Step 7: Move the caption scripts to `media/`**

`scripts/describe-missing.mjs`:

- `const dir = join(goonpacksDir, entry.name, 'media');`
- `const IMAGE_RE = /\.(jpe?g|png|webp)$/i;` — the pack format's still types
  only. Videos are skipped: their captions are hand-written.
- Update the header comment: scans `goonpacks/<dir>/media/`, captions stills,
  and leaves videos alone.

`scripts/describe-image.mjs`: comments only — every `pictures/` in a path
example becomes `media/`.

`.gitignore`: `/goonpacks/elise/pictures/` → `/goonpacks/elise/media/`.

- [ ] **Step 8: Prove the unit tests and the build script**

```bash
npx jest src/lib/goonpacks/
```

Then rebuild the example pack. It carries no media, so the format-1 carve-out
means it builds unchanged — but bump it anyway, because the example pack is what
authors copy and it should show the current format:

```bash
# goonpacks/elise/manifest.json: "format": 1 → 2
npm run goonpack:build
```

Expected: `elise: 0 errors` / `built, elise.zip`, and `goonpacks/elise.zip`
rewritten. The new rules themselves (`.mov`, subfolders, stem collisions) are
covered by the unit tests written in Step 1 — don't build a scratch pack to
re-prove them.

**Do not run `npm run typecheck` yet.** `use-goonpack-library.ts` still calls
`parsePack` with zip bytes and will not compile until Phase D. That is expected
and is the reason this is one task.

- [ ] **Step 9: Commit the phase**

```bash
git add -A
git commit -m "Goonpacks: validate a pack as a tree of names, over media/"
```

### Phase B — OPFS trees, the marker, and the clean pass

`store.ts` is replaced outright: the IndexedDB zip store goes, OPFS trees
arrive. Its only remaining IndexedDB call is the one-off purge of the old
database.

**Files:**

- Rewrite: `src/lib/goonpacks/store.ts`
- Modify: `tsconfig.json`
- Create: `tests/e2e/goonpack-storage.spec.ts` (written now, run in Phase D —
  the sweep only reaches app load once the new hook exists)

**Interfaces:**

- Consumes: `PackTree` (`src/lib/goonpacks/pack.ts`).
- Produces, from `store.ts`:
  - `const PACKS_DIR = 'goonpacks'`, `const MARKER = '.complete'`
  - `function packsRoot(create?: boolean): Promise<FileSystemDirectoryHandle | null>`
  - `function listPackKeys(): Promise<string[]>` — every subdirectory of
    `goonpacks/`
  - `function openPackTree(key: string): Promise<PackTree | null>`
  - `function createPackDir(key: string): Promise<FileSystemDirectoryHandle>` —
    removes any existing tree first
  - `function markComplete(key: string): Promise<void>`
  - `function hasMarker(key: string): Promise<boolean>`
  - `function removePackTree(key: string): Promise<void>` — marker first, tree
    second
  - `function sweepIncomplete(): Promise<string[]>` — deletes markerless trees,
    returns the keys removed
  - `function readMediaFile(key: string, file: string): Promise<File | null>`
  - `function estimateHeadroom(bytes: number): Promise<{ ok: boolean; available: number }>`
  - `function requestPersistence(): Promise<void>`
  - `function purgeLegacyDatabase(): Promise<void>` — the last IndexedDB call in
    the codebase, wired into the load path in Phase D

- [ ] **Step 1: Let TypeScript see the OPFS async iterators**

`FileSystemDirectoryHandle.values()`/`entries()`/`keys()` live in TypeScript's
`lib.dom.asynciterable.d.ts`, which the current `lib` list doesn't include.

In `tsconfig.json`:

```json
    "lib": ["es2022", "DOM", "DOM.Iterable", "DOM.AsyncIterable"],
```

- [ ] **Step 2: Write the e2e for the clean pass**

Create `tests/e2e/goonpack-storage.spec.ts`. It drives OPFS through raw web APIs
in the page, so it needs nothing from the app but the app's own clean pass
running at load — which arrives in Phase D, so **this spec is written now and
first run in Phase D Step 7.**

```ts
import { expect, test } from '@playwright/test';

// Build a pack tree directly in OPFS, optionally marked complete. Returns
// nothing — the assertions read the tree back the same way.
async function makeTree(
  page: import('@playwright/test').Page,
  key: string,
  marked: boolean,
) {
  await page.evaluate(
    async ([k, m]) => {
      const root = await navigator.storage.getDirectory();
      const packs = await root.getDirectoryHandle('goonpacks', {
        create: true,
      });
      const dir = await packs.getDirectoryHandle(k as string, { create: true });
      const manifest = await dir.getFileHandle('manifest.json', {
        create: true,
      });
      const w = await manifest.createWritable();
      await w.write('{}');
      await w.close();
      if (m === true) {
        const marker = await dir.getFileHandle('.complete', { create: true });
        await (await marker.createWritable()).close();
      }
    },
    [key, marked] as const,
  );
}

async function packKeys(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    let packs: FileSystemDirectoryHandle;
    try {
      packs = await root.getDirectoryHandle('goonpacks');
    } catch {
      return [];
    }
    const out: string[] = [];
    for await (const [name, handle] of packs.entries()) {
      if (handle.kind === 'directory') out.push(name);
    }
    return out.sort();
  });
}

test('the load-time clean pass removes markerless trees only', async ({
  page,
}) => {
  await page.goto('/');
  await makeTree(page, 'kept.pack@1.0.0', true);
  await makeTree(page, 'crashed.pack@1.0.0', false);
  expect(await packKeys(page)).toEqual([
    'crashed.pack@1.0.0',
    'kept.pack@1.0.0',
  ]);

  // The Goonpacks tab mounts the library, which sweeps before it reads.
  await page.reload();
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await expect(page.getByText('Checking packs…')).toHaveCount(0);

  expect(await packKeys(page)).toEqual(['kept.pack@1.0.0']);
});
```

- [ ] **Step 3: Replace `store.ts`**

Delete the IndexedDB zip store outright — `DB_NAME`, `STORE`, `openDb`, `tx`,
`PackRecord`, `listPackRecords`, `putPack`, `deletePack`, `getPackBytes` — and
replace the whole file with the header comment and OPFS layer below.
`purgeLegacyDatabase` is the only IndexedDB left, and it only deletes.

```ts
// Pack storage: OPFS holds ONE directory tree per installed pack, keyed by
// id@version, containing the pack's files as extracted. Nothing derived is
// persisted anywhere — the library is rebuilt from the trees at every load — so
// there is exactly one notion of a valid pack and no second store to drift out
// of step. The user's zip files remain the store of record ("Packs live in
// browser storage; keep your zips").
//
// A marker file, written last, means the tree is complete: extraction and
// validation both succeeded before it appeared. Validation goes on names, so it
// cannot tell a complete media/ from one missing six hundred files — the marker
// is the only signal that says so. Removal deletes the marker first and the tree
// second, so a crash mid-removal leaves exactly what a crash mid-import leaves,
// and one clean pass at load covers both.
import { isJunkPath } from './media';
import { MEDIA_DIR, type PackTree } from './pack';

export const PACKS_DIR = 'goonpacks';
export const MARKER = '.complete';

export async function packsRoot(
  create = false,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(PACKS_DIR, { create });
  } catch {
    return null; // no OPFS, or the directory doesn't exist yet
  }
}

export async function listPackKeys(): Promise<string[]> {
  const packs = await packsRoot();
  if (packs === null) return [];
  const keys: string[] = [];
  for await (const [name, handle] of packs.entries()) {
    if (handle.kind === 'directory') keys.push(name);
  }
  return keys;
}

// Every file in a pack's tree, as validation sees it: root files plus one level
// of media/ (deeper nesting is listed too, so parsePack can reject it by name).
async function listTree(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  const walk = async (
    handle: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> => {
    for await (const [name, entry] of handle.entries()) {
      const path = `${prefix}${name}`;
      if (entry.kind === 'directory') {
        await walk(entry, `${path}/`);
      } else if (!isJunkPath(path)) {
        names.push(path);
      }
    }
  };
  await walk(dir, '');
  return names;
}

export async function openPackTree(key: string): Promise<PackTree | null> {
  const packs = await packsRoot();
  if (packs === null) return null;
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await packs.getDirectoryHandle(key);
  } catch {
    return null;
  }
  const names = await listTree(dir);
  return {
    names,
    readText: async (path: string) => {
      const parts = path.split('/');
      let at = dir;
      for (const part of parts.slice(0, -1)) {
        at = await at.getDirectoryHandle(part);
      }
      const file = await at.getFileHandle(parts[parts.length - 1]!);
      return (await file.getFile()).text();
    },
  };
}

// A fresh directory for a pack being imported: any existing tree goes first, so
// a re-import never merges with what it replaces.
export async function createPackDir(
  key: string,
): Promise<FileSystemDirectoryHandle> {
  const packs = await packsRoot(true);
  if (packs === null) throw new Error('no OPFS');
  await packs.removeEntry(key, { recursive: true }).catch(() => {
    // nothing there — the common case
  });
  return packs.getDirectoryHandle(key, { create: true });
}

export async function markComplete(key: string): Promise<void> {
  const packs = await packsRoot(true);
  if (packs === null) throw new Error('no OPFS');
  const dir = await packs.getDirectoryHandle(key);
  const marker = await dir.getFileHandle(MARKER, { create: true });
  await (await marker.createWritable()).close();
}

export async function hasMarker(key: string): Promise<boolean> {
  const packs = await packsRoot();
  if (packs === null) return false;
  try {
    const dir = await packs.getDirectoryHandle(key);
    await dir.getFileHandle(MARKER);
    return true;
  } catch {
    return false;
  }
}

// Marker first, tree second: an interrupted removal leaves a markerless tree,
// which is what the clean pass already deletes.
export async function removePackTree(key: string): Promise<void> {
  const packs = await packsRoot();
  if (packs === null) return;
  try {
    const dir = await packs.getDirectoryHandle(key);
    await dir.removeEntry(MARKER).catch(() => {
      // already gone
    });
  } catch {
    return; // no tree
  }
  await packs.removeEntry(key, { recursive: true }).catch(() => {
    // already gone
  });
}

// The one clean pass, run before every library build: a tree with no marker is
// a crashed import, a cancelled import or a crashed removal — all the same
// state, all deleted.
export async function sweepIncomplete(): Promise<string[]> {
  const removed: string[] = [];
  for (const key of await listPackKeys()) {
    if (await hasMarker(key)) continue;
    await removePackTree(key);
    removed.push(key);
  }
  return removed;
}

// A media file as a File — disk-backed and seekable, which is what a <video>
// needs and what keeps a still off the heap until it is shown.
export async function readMediaFile(
  key: string,
  file: string,
): Promise<File | null> {
  const packs = await packsRoot();
  if (packs === null) return null;
  try {
    const dir = await packs.getDirectoryHandle(key);
    const media = await dir.getDirectoryHandle(MEDIA_DIR.replace('/', ''));
    return await (await media.getFileHandle(file)).getFile();
  } catch {
    return null;
  }
}

// Refuse an import up front with a real number rather than failing partway
// through. Headroom covers the extracted copy plus the browser's own slack.
const HEADROOM_BYTES = 64 * 1024 * 1024;

export async function estimateHeadroom(
  bytes: number,
): Promise<{ ok: boolean; available: number }> {
  const est = await navigator.storage.estimate();
  const quota = est.quota ?? 0;
  const usage = est.usage ?? 0;
  const available = Math.max(0, quota - usage);
  return { ok: available >= bytes + HEADROOM_BYTES, available };
}

// Asked once, on the first import: without it the origin's storage is
// best-effort and can be evicted under pressure.
export async function requestPersistence(): Promise<void> {
  try {
    if (!(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // not supported — best-effort storage it is
  }
}

// One-off reclamation of the quota still held by pack zips from before packs
// moved to OPFS. Nothing reads that database.
export function purgeLegacyDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase('autogoon-goonpacks');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
```

- [ ] **Step 4: Commit the phase**

Nothing imports the new `store.ts` yet and the hook's old IndexedDB calls are
now dangling — that is Phase D's job. Commit as is:

```bash
git add -A
git commit -m "Goonpacks: OPFS pack trees, the completion marker and the clean pass"
```

### Phase C — build the library index from trees

The whole load pass — walk keys, validate each tree, apply the cross-pack rules,
build entries, rows and per-pack content with lazy media URLs — as one function
over an injected source. Unit-testable in node because the source is injected.

**Files:**

- Create: `src/lib/goonpacks/library.ts`
- Create: `src/lib/goonpacks/library.test.ts`

**Interfaces:**

- Consumes: `parsePack`, `peekManifest`, `PackTree`, `ParsedMedia` (`./pack`);
  `buildEntries`, `packKey`, `keyId`, `keyVersion`, `newestFirst`, `LoadedPack`,
  `LibraryEntry`, `PackSummary` (`./entries`); `PackError`, `PackManifest`
  (`./manifest`); `PackContent` (`./resolve`); `COMPANIONS`
  (`@/lib/companions/companions`).
- Produces:

```ts
export type LibrarySource = {
  listKeys(): Promise<string[]>;
  openTree(key: string): Promise<PackTree | null>;
  mediaUrl(key: string, media: ParsedMedia): Promise<string>;
};

export type PackRow = {
  id: string; // the storage key (id@version)
  manifest?: PackManifest;
  summary?: PackSummary;
  peek?: PackPeek;
  incompatible?: string[];
};

export type Library = {
  entries: LibraryEntry[];
  rows: PackRow[];
  content: Map<string, PackContent>; // valid packs only, by storage key
  manifests: Map<string, PackManifest>; // the valid set, for import-time base checks
};

export function baseError(
  manifest: PackManifest,
  isInstalled: (id: string) => 'companion' | 'overlay' | undefined,
): string | null;

export function buildLibrary(source: LibrarySource): Promise<Library>;

export function revokeLibrary(library: Library): void;
```

`PackRow` moves here from `use-goonpack-library.ts` (the hook re-exports it, so
`goonpacks-panel.tsx`'s import keeps working).

- [ ] **Step 1: Write the failing library tests**

Create `src/lib/goonpacks/library.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { companionList } from '@/lib/companions/companions';
import { buildLibrary, type LibrarySource } from './library';
import type { PackTree } from './pack';

const BUILT_IN = companionList[0]!.id;

const manifest = (extra: object) =>
  JSON.stringify({
    format: 2,
    version: '1.0.0',
    aboutThePack: 'a test pack',
    ...extra,
  });

// A source over plain objects: key → { path → text }. Media files are listed by
// name and never read, exactly as OPFS backs it.
function source(trees: Record<string, Record<string, string>>): LibrarySource {
  return {
    listKeys: () => Promise.resolve(Object.keys(trees)),
    openTree: (key) => {
      const files = trees[key];
      if (files === undefined) return Promise.resolve(null);
      const tree: PackTree = {
        names: Object.keys(files),
        readText: (path) => Promise.resolve(files[path] ?? ''),
      };
      return Promise.resolve(tree);
    },
    mediaUrl: (key, media) => Promise.resolve(`blob:${key}/${media.file}`),
  };
}

const completePack = (id: string) => ({
  'manifest.json': manifest({ id, companion: { name: 'Testy', voiceId: 'v' } }),
  'system-prompt.md': 'You are Testy.',
  'media/a.jpg': '',
  'media/a.txt': 'a still',
  'media/b.mp4': '',
});

describe('buildLibrary', () => {
  it('lists a valid pack as a row, an entry and resolvable content', async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    expect(lib.rows).toHaveLength(1);
    expect(lib.rows[0]).toMatchObject({
      id: 'pub.comp@1.0.0',
      summary: { media: { images: 1, videos: 1 }, hasPrompt: true },
    });
    expect(lib.rows[0]!.incompatible).toBeUndefined();
    expect(lib.entries.some((e) => e.companion.id === 'pub.comp')).toBe(true);
    const content = lib.content.get('pub.comp@1.0.0')!;
    expect(content.media.map((m) => m.ref)).toEqual([
      'goonpack:pub.comp@1.0.0/a',
      'goonpack:pub.comp@1.0.0/b',
    ]);
    expect(content.media[1]!.kind).toBe('video');
  });

  it('mints a media URL only when load() is called, then memoises it', async () => {
    const lib = await buildLibrary(
      source({ 'pub.comp@1.0.0': completePack('pub.comp') }),
    );
    const item = lib.content.get('pub.comp@1.0.0')!.media[0]!;
    expect(item.src).toBeUndefined();
    expect(await item.load()).toBe('blob:pub.comp@1.0.0/a.jpg');
    expect(item.src).toBe('blob:pub.comp@1.0.0/a.jpg');
    expect(await item.load()).toBe('blob:pub.comp@1.0.0/a.jpg');
  });

  it('rejects a tree whose manifest disagrees with its directory name', async () => {
    const lib = await buildLibrary(
      source({ 'wrong.key@9.9.9': completePack('pub.comp') }),
    );
    expect(lib.rows[0]!.incompatible).toEqual([
      "The pack's id and version don't match the pack it was imported as.",
    ]);
    expect(lib.content.size).toBe(0);
  });

  it('lists an invalid pack as incompatible, described from its manifest peek', async () => {
    const lib = await buildLibrary(
      source({
        'pub.broken@1.0.0': {
          'manifest.json': JSON.stringify({
            format: 'bad',
            id: 'pub.broken',
            version: '1.0.0',
            companion: { name: 'Broken' },
          }),
        },
      }),
    );
    expect(lib.rows[0]!.peek).toEqual({ name: 'Broken', version: '1.0.0' });
    expect(lib.rows[0]!.incompatible).toHaveLength(1);
  });

  it("holds back an overlay whose base isn't installed, and heals when it is", async () => {
    const overlay = {
      'manifest.json': manifest({
        id: 'pub.goth',
        base: 'pub.comp',
        companion: { voiceId: 'v2' },
      }),
    };
    const alone = await buildLibrary(source({ 'pub.goth@1.0.0': overlay }));
    expect(alone.rows[0]!.incompatible).toEqual([
      "This overlay changes pub.comp, which isn't installed — import that pack first.",
    ]);
    const healed = await buildLibrary(
      source({
        'pub.goth@1.0.0': overlay,
        'pub.comp@1.0.0': completePack('pub.comp'),
      }),
    );
    expect(healed.rows.every((r) => r.incompatible === undefined)).toBe(true);
  });

  it("rejects a complete pack squatting a built-in's id", async () => {
    const lib = await buildLibrary(
      source({ [`${BUILT_IN}@1.0.0`]: completePack(BUILT_IN) }),
    );
    expect(lib.rows[0]!.incompatible).toEqual([
      "The pack's id belongs to a built-in companion — pick a different id.",
    ]);
  });

  it('rejects an overlay laid on another overlay', async () => {
    const lib = await buildLibrary(
      source({
        'pub.a@1.0.0': {
          'manifest.json': manifest({ id: 'pub.a', base: BUILT_IN }),
        },
        'pub.b@1.0.0': {
          'manifest.json': manifest({ id: 'pub.b', base: 'pub.a' }),
        },
      }),
    );
    const b = lib.rows.find((r) => r.id === 'pub.b@1.0.0')!;
    expect(b.incompatible).toEqual([
      'The base must be a complete companion, not another overlay.',
    ]);
  });

  it('rejects versions of one id that disagree about being an overlay', async () => {
    const lib = await buildLibrary(
      source({
        'pub.x@1.0.0': completePack('pub.x'),
        'pub.x@2.0.0': {
          'manifest.json': manifest({
            id: 'pub.x',
            version: '2.0.0',
            base: BUILT_IN,
          }),
        },
      }),
    );
    expect(lib.rows.every((r) => r.incompatible !== undefined)).toBe(true);
  });

  it('sorts rows by id then version ascending', async () => {
    const lib = await buildLibrary(
      source({
        'pub.b@1.0.0': completePack('pub.b'),
        'pub.a@2.0.0': completePack('pub.a'),
        'pub.a@1.0.0': completePack('pub.a'),
      }),
    );
    expect(lib.rows.map((r) => r.id)).toEqual([
      'pub.a@1.0.0',
      'pub.a@2.0.0',
      'pub.b@1.0.0',
    ]);
  });

  it('drops a key whose tree has vanished', async () => {
    const src = source({ 'pub.comp@1.0.0': completePack('pub.comp') });
    const lib = await buildLibrary({
      ...src,
      listKeys: () => Promise.resolve(['pub.comp@1.0.0', 'gone.pack@1.0.0']),
    });
    expect(lib.rows.map((r) => r.id)).toEqual(['pub.comp@1.0.0']);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx jest src/lib/goonpacks/library.test.ts` Expected: FAIL —
`Cannot find module './library'`.

- [ ] **Step 3: Write `library.ts`**

```ts
// The pack library, built in memory at every app load by walking the OPFS
// trees. Nothing derived is persisted, so validity is one live verdict: a pack
// either passes today's rules and is offered, or it lists on the Goonpacks
// screen as incompatible — with the reason — and is offered nowhere. An
// incompatible pack heals on a later load (e.g. its base gets imported).
//
// The source is injected so this whole pass is testable without OPFS; the app
// passes the OPFS-backed one from store.ts.
import { COMPANIONS, type CompanionMedia } from '@/lib/companions/companions';
import {
  buildEntries,
  keyId,
  keyVersion,
  newestFirst,
  packKey,
  type LibraryEntry,
  type LoadedPack,
  type PackSummary,
} from './entries';
import { PackError, type PackManifest } from './manifest';
import {
  MANIFEST,
  parsePack,
  peekManifest,
  type PackPeek,
  type PackTree,
  type ParsedMedia,
} from './pack';
import type { PackContent } from './resolve';

export type LibrarySource = {
  listKeys(): Promise<string[]>;
  openTree(key: string): Promise<PackTree | null>;
  mediaUrl(key: string, media: ParsedMedia): Promise<string>;
};

// One row of the Goonpacks admin list, one per installed id@version. A valid
// pack carries its manifest and summary. An incompatible one carries every
// problem validation could determine, plus whatever we can still say about it:
// its manifest when only the cross-pack checks failed, or a best-effort peek
// when validation itself did.
export type PackRow = {
  id: string;
  manifest?: PackManifest;
  summary?: PackSummary;
  peek?: PackPeek;
  incompatible?: string[];
};

export type Library = {
  entries: LibraryEntry[];
  rows: PackRow[];
  content: Map<string, PackContent>;
  manifests: Map<string, PackManifest>;
};

// Cross-pack rules a tree can't know about itself: an overlay's base must be
// installed and must be a companion (built-in or complete pack), never another
// overlay. Applied at load over the parsed set — and at import for immediate
// feedback.
export function baseError(
  manifest: PackManifest,
  isInstalled: (id: string) => 'companion' | 'overlay' | undefined,
): string | null {
  if (manifest.base === undefined) return null;
  const base = isInstalled(manifest.base);
  if (base === undefined) {
    return `This overlay changes ${manifest.base}, which isn't installed — import that pack first.`;
  }
  if (base === 'overlay') {
    return 'The base must be a complete companion, not another overlay.';
  }
  return null;
}

const summarize = (media: ParsedMedia[], hasPrompt: boolean): PackSummary => ({
  media: {
    images: media.filter((m) => m.kind === 'image').length,
    videos: media.filter((m) => m.kind === 'video').length,
  },
  hasPrompt,
});

// A media entry whose object URL is minted on first render and memoised here:
// a pack can hold thousands of files, most of which are never shown. The URL
// then lives as long as this entry — revoked only when the pack is removed or
// re-imported (revokeLibrary).
function mediaEntry(
  source: LibrarySource,
  key: string,
  m: ParsedMedia,
): CompanionMedia {
  let pending: Promise<string> | null = null;
  const entry: CompanionMedia = {
    kind: m.kind,
    description: m.description,
    // Stable thread reference: object URLs die with the session, so the thread
    // persists this ref and rendering resolves it.
    ref: `goonpack:${key}/${m.name}`,
    load: () =>
      (pending ??= source.mediaUrl(key, m).then((url) => {
        entry.src = url;
        return url;
      })),
  };
  return entry;
}

export async function buildLibrary(source: LibrarySource): Promise<Library> {
  const valid: (LoadedPack & { key: string; content: PackContent })[] = [];
  const bad: PackRow[] = [];

  for (const key of await source.listKeys()) {
    const tree = await source.openTree(key);
    if (tree === null) continue; // removed between the listing and the read
    try {
      const parsed = await parsePack(tree);
      if (packKey(parsed.manifest) !== key) {
        throw new PackError(
          "The pack's id and version don't match the pack it was imported as.",
        );
      }
      valid.push({
        key,
        manifest: parsed.manifest,
        summary: summarize(parsed.media, parsed.systemPrompt !== undefined),
        content: {
          manifest: parsed.manifest,
          systemPrompt: parsed.systemPrompt,
          media: parsed.media.map((m) => mediaEntry(source, key, m)),
        },
      });
    } catch (e) {
      let peek: PackPeek = {};
      try {
        peek = peekManifest(await tree.readText(MANIFEST));
      } catch {
        // a tree we can't even read a manifest out of describes itself as nothing
      }
      bad.push({
        id: key,
        peek,
        incompatible:
          e instanceof PackError ? e.problems : ["The pack couldn't be read."],
      });
    }
  }

  // Cross-pack pass over ids (versions of an id stand or fall together for
  // these): a complete pack squatting a built-in id, an id whose versions
  // disagree about being overlay or complete, then overlay base rules against
  // what remains.
  const kinds = new Map<string, Set<string>>();
  for (const p of valid) {
    const set = kinds.get(p.manifest.id) ?? new Set<string>();
    set.add(p.manifest.base === undefined ? 'complete' : 'overlay');
    kinds.set(p.manifest.id, set);
  }
  const isInstalled = (id: string): 'companion' | 'overlay' | undefined =>
    COMPANIONS[id] !== undefined || kinds.get(id)?.has('complete') === true
      ? 'companion'
      : kinds.has(id)
        ? 'overlay'
        : undefined;

  const survivors: typeof valid = [];
  for (const p of valid) {
    const id = p.manifest.id;
    let reason: string | null;
    if (kinds.get(id)!.size > 1) {
      reason =
        'Installed versions of this id disagree about being an overlay or a complete companion.';
    } else if (p.manifest.base === undefined && COMPANIONS[id] !== undefined) {
      reason =
        "The pack's id belongs to a built-in companion — pick a different id.";
    } else {
      reason = baseError(p.manifest, isInstalled);
    }
    if (reason === null) survivors.push(p);
    else bad.push({ id: p.key, manifest: p.manifest, incompatible: [reason] });
  }

  return {
    entries: buildEntries(survivors),
    content: new Map(survivors.map((p) => [p.key, p.content])),
    manifests: new Map(survivors.map((p) => [p.key, p.manifest])),
    rows: [
      ...survivors.map((p) => ({
        id: p.key,
        manifest: p.manifest,
        summary: p.summary,
      })),
      ...bad,
    ].sort(
      // Rows: ids alphabetical, versions ascending within an id — the whole
      // inventory reads one way (the chooser's pickers are where newest-first
      // means something).
      (a, b) =>
        keyId(a.id).localeCompare(keyId(b.id)) ||
        newestFirst(keyVersion(b.id), keyVersion(a.id)),
    ),
  };
}

// Every object URL the index handed out. Called when the index is replaced —
// after an import or a removal — never between renders.
export function revokeLibrary(library: Library): void {
  for (const content of library.content.values()) {
    for (const m of content.media) {
      if (m.src !== undefined) URL.revokeObjectURL(m.src);
    }
  }
}
```

- [ ] **Step 4: Run the library tests**

Run: `npx jest src/lib/goonpacks/library.test.ts` Expected: PASS.

- [ ] **Step 5: Commit the phase**

```bash
git add -A
git commit -m "Goonpacks: build the library index from pack trees"
```

`PackRow` now lives here; the copy still in `use-goonpack-library.ts` goes when
that file is rewritten in the next phase.

### Phase D — import, the hook, and the panel

Import extracts to a tree; load reads trees; the last IndexedDB caller goes.
Extraction runs on the main thread here — moving it into a Worker is Task 4, and
is a change to where `extractZip` is called, not to what it does. **This phase
is where the gates come back: the branch must typecheck, lint and pass every
test by the end of it.**

**Files:**

- Create: `src/lib/goonpacks/extract.ts`
- Create: `src/lib/goonpacks/import.ts`
- Modify: `src/hooks/use-goonpack-library.ts` (rewrite)
- Modify: `src/components/goonpacks-panel.tsx` (progress)
- Modify: `tests/e2e/goonpack-import.spec.ts`

**Interfaces:**

- Consumes: everything from Tasks 3–5.
- Produces:
  - `extract.ts`:
    - `function peekZip(file: File): Promise<{ manifest: string | null; names: string[] }>`
    - `function extractZip(file: File, dir: FileSystemDirectoryHandle, onProgress?: (bytesRead: number) => void): Promise<void>`
  - `import.ts`:
    - `type ImportStage = { phase: 'extracting' | 'checking'; bytes: number; total: number }`
    - `type PendingImport = { manifest: PackManifest; replaces: boolean; commit(onProgress?: (s: ImportStage) => void): Promise<void> }`
    - `function prepareImport(file: File, installed: Map<string, PackManifest>): Promise<PendingImport>`
  - `use-goonpack-library.ts` re-exports `PackRow`, `PendingImport`,
    `LibraryEntry`, `PackOption` as it does now.

- [ ] **Step 1: Write `extract.ts`**

```ts
// Zip → OPFS tree. The zip is transport: it is streamed once, entry by entry,
// straight to disk, and never held whole. Backpressure is explicit — each pushed
// chunk's writes are awaited before the next chunk is read — so peak memory is a
// couple of chunks regardless of how big the pack is.
import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import { isJunkPath } from './media';
import { MANIFEST } from './pack';

// One zip entry's destination, opened lazily (the handle is async; fflate's
// ondata is not).
type Sink = {
  queue: Uint8Array[];
  done: boolean;
  writer: Promise<FileSystemWritableFileStream> | null;
};

// Open `media/x.jpg` inside the pack directory, creating `media/` as needed.
async function fileHandle(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/');
  let at = dir;
  for (const part of parts.slice(0, -1)) {
    at = await at.getDirectoryHandle(part, { create: true });
  }
  return at.getFileHandle(parts[parts.length - 1]!, { create: true });
}

export async function extractZip(
  file: File,
  dir: FileSystemDirectoryHandle,
  onProgress?: (bytesRead: number) => void,
): Promise<void> {
  const sinks: Sink[] = [];
  const unzip = new Unzip((entry) => {
    if (isJunkPath(entry.name)) {
      entry.ondata = () => {
        // read and discard: junk never lands in a tree
      };
      entry.start();
      return;
    }
    const sink: Sink = { queue: [], done: false, writer: null };
    sinks.push(sink);
    sink.writer = fileHandle(dir, entry.name).then((h) => h.createWritable());
    entry.ondata = (err, chunk, final) => {
      if (err !== null) throw err;
      if (chunk.length > 0) sink.queue.push(chunk);
      if (final) sink.done = true;
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  // Drain every open sink: writes land in order because each sink's promise
  // chain is sequential, and the caller awaits this between pushes.
  const drain = async (): Promise<void> => {
    for (const sink of sinks) {
      if (sink.writer === null) continue;
      const writer = await sink.writer;
      while (sink.queue.length > 0) {
        await writer.write(sink.queue.shift()!);
      }
      if (sink.done) {
        await writer.close();
        sink.writer = null;
      }
    }
  };

  const reader = file.stream().getReader();
  let read = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      read += value.length;
      unzip.push(value, false);
      await drain();
      onProgress?.(read);
    }
    unzip.push(new Uint8Array(0), true);
    await drain();
  } catch (e) {
    // Close what's open so the tree isn't left holding locks; the caller
    // deletes it. No marker was written, so the clean pass would too.
    for (const sink of sinks) {
      if (sink.writer !== null)
        await (await sink.writer).close().catch(() => {});
    }
    throw e;
  } finally {
    await reader.cancel().catch(() => {
      // already drained
    });
  }
}

// Read a zip's manifest.json without extracting anything, so the confirm sheet
// can name the pack before a byte is written. Resolves as soon as the manifest
// is complete — it sorts before media/ in every zip tool's ordering, so this
// normally reads a few kilobytes. A zip with no root manifest is read to the
// end, and `names` is what parsePack needs to name the mistake.
export async function peekZip(
  file: File,
): Promise<{ manifest: string | null; names: string[] }> {
  const names: string[] = [];
  const chunks: Uint8Array[] = [];
  let manifest: string | null = null;
  const unzip = new Unzip((entry) => {
    names.push(entry.name);
    entry.ondata = (err, chunk, final) => {
      if (err !== null || entry.name !== MANIFEST) return;
      if (chunk.length > 0) chunks.push(chunk);
      if (final) {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const joined = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) {
          joined.set(c, at);
          at += c.length;
        }
        manifest = strFromU8(joined);
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  try {
    while (manifest === null) {
      const { value, done } = await reader.read();
      if (done) break;
      unzip.push(value, false);
    }
  } catch {
    // A zip we can't read peeks as nothing; the import reports it.
  } finally {
    await reader.cancel().catch(() => {
      // already at the end
    });
  }
  return { manifest, names };
}
```

- [ ] **Step 2: Write `import.ts`**

```ts
// The import pipeline: check the quota, extract the zip into its tree, validate
// the tree, and only then write the marker that makes it an installed pack.
// A tree that fails deletes itself; an abandoned one is removed by the clean
// pass at the next load, so there is no cancel to implement.
import { COMPANIONS } from '@/lib/companions/companions';
import { extractZip, peekZip } from './extract';
import { packKey } from './entries';
import { baseError } from './library';
import { PackError, parseManifest, type PackManifest } from './manifest';
import { parsePack } from './pack';
import {
  createPackDir,
  estimateHeadroom,
  markComplete,
  openPackTree,
  removePackTree,
  requestPersistence,
} from './store';

export type ImportStage = {
  phase: 'extracting' | 'checking';
  bytes: number;
  total: number;
};

export type PendingImport = {
  manifest: PackManifest;
  replaces: boolean; // this exact id+version is already installed
  commit(onProgress?: (stage: ImportStage) => void): Promise<void>;
};

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

// Read the zip's manifest and run the checks that don't need the tree, so the
// confirm sheet names the pack before anything is written.
export async function prepareImport(
  file: File,
  installed: Map<string, PackManifest>,
): Promise<PendingImport> {
  const { manifest: raw, names } = await peekZip(file);
  if (raw === null) {
    const tops = new Set(
      names.map((n) => (n.includes('/') ? n.slice(0, n.indexOf('/')) : '')),
    );
    const wrapper = tops.size === 1 ? [...tops][0]! : '';
    throw new PackError(
      wrapper !== ''
        ? `Everything is inside ${wrapper}/ — zip the folder's contents, not the folder.`
        : "No manifest.json at the zip root — zip the pack folder's contents, not the folder.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PackError(
      "manifest.json isn't valid JSON — check for missing quotes or commas.",
    );
  }
  const m = parseManifest(parsed);

  // Immediate feedback on what the load pass would reject anyway.
  if (m.base === undefined && COMPANIONS[m.id] !== undefined) {
    throw new PackError(
      "The pack's id belongs to a built-in companion — pick a different id.",
    );
  }
  const err = baseError(m, (id) => {
    if (COMPANIONS[id] !== undefined) return 'companion';
    for (const v of installed.values()) {
      if (v.id === id) return v.base === undefined ? 'companion' : 'overlay';
    }
    return undefined;
  });
  if (err !== null) throw new PackError(err);

  const key = packKey(m);
  return {
    manifest: m,
    replaces: installed.has(key),
    commit: async (onProgress) => {
      const headroom = await estimateHeadroom(file.size);
      if (!headroom.ok) {
        throw new PackError(
          `Not enough browser storage: this pack needs about ${mb(file.size)} and there is ${mb(headroom.available)} free.`,
        );
      }
      await requestPersistence();
      onProgress?.({ phase: 'extracting', bytes: 0, total: file.size });
      const dir = await createPackDir(key);
      try {
        await extractZip(file, dir, (bytes) =>
          onProgress?.({ phase: 'extracting', bytes, total: file.size }),
        );
      } catch (e) {
        await removePackTree(key);
        throw e instanceof PackError
          ? e
          : new PackError("The zip couldn't be read.");
      }
      onProgress?.({ phase: 'checking', bytes: file.size, total: file.size });
      const tree = await openPackTree(key);
      if (tree === null) {
        throw new PackError('The pack vanished from browser storage.');
      }
      try {
        const validated = await parsePack(tree);
        if (packKey(validated.manifest) !== key) {
          throw new PackError(
            "The pack's id and version don't match the manifest it was read from.",
          );
        }
      } catch (e) {
        await removePackTree(key);
        throw e;
      }
      // Last: the tree is complete and valid, and only now is it installed.
      await markComplete(key);
    },
  };
}
```

- [ ] **Step 3: Rewrite the hook**

Replace `src/hooks/use-goonpack-library.ts` entirely:

```ts
'use client';
// The pack library for React. One index per session, module-level: two screens
// each hold this hook (the Companions chooser and the Goonpacks tab), and a
// media file's object URL must be minted once and live as long as its index
// entry — two independent indexes would mint two and revoke neither. Import and
// removal replace the index and revoke what the old one handed out.
import { useCallback, useEffect, useState } from 'react';
import type { Companion } from '@/lib/companions/companions';
import type { LibraryEntry, PackOption } from '@/lib/goonpacks/entries';
import { prepareImport, type PendingImport } from '@/lib/goonpacks/import';
import {
  buildLibrary,
  revokeLibrary,
  type Library,
  type LibrarySource,
  type PackRow,
} from '@/lib/goonpacks/library';
import { buildEntries } from '@/lib/goonpacks/entries';
import {
  applyOverlay,
  packToCompanion,
  packToCompanionRaw,
  resolveDefault,
} from '@/lib/goonpacks/resolve';
import { PackError } from '@/lib/goonpacks/manifest';
import {
  listPackKeys,
  openPackTree,
  purgeLegacyDatabase,
  readMediaFile,
  removePackTree,
  sweepIncomplete,
} from '@/lib/goonpacks/store';

export type { LibraryEntry, PackOption, PackRow, PendingImport };

const source: LibrarySource = {
  listKeys: listPackKeys,
  openTree: openPackTree,
  mediaUrl: async (key, media) => {
    const file = await readMediaFile(key, media.file);
    if (file === null) throw new Error(`missing media: ${key}/${media.file}`);
    // slice re-types the file without reading it, so <video> and <img> get a
    // MIME type without the bytes ever entering the heap.
    return URL.createObjectURL(file.slice(0, file.size, media.mimeType));
  },
};

const EMPTY: Library = {
  entries: buildEntries([]),
  rows: [],
  content: new Map(),
  manifests: new Map(),
};

// The session's one index, and the components watching it.
let current: Library | null = null;
let inflight: Promise<Library> | null = null;
const listeners = new Set<(library: Library) => void>();

async function load(): Promise<Library> {
  // One clean pass before anything reads the trees: a tree with no marker is an
  // interrupted import or removal. Then the old zip database goes, once —
  // nothing reads it, and it is holding quota.
  await sweepIncomplete();
  void purgeLegacyDatabase();
  const built = await buildLibrary(source);
  if (current !== null) revokeLibrary(current);
  current = built;
  for (const listener of listeners) listener(built);
  return built;
}

function library(): Promise<Library> {
  return (inflight ??= load());
}

// After an import or a removal: throw the index away and build a fresh one,
// revoking the URLs the old one handed out.
function rebuild(): Promise<Library> {
  inflight = load();
  return inflight;
}

export function useGoonpackLibrary() {
  const [state, setState] = useState<Library>(() => current ?? EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready'>(() =>
    current === null ? 'loading' : 'ready',
  );

  useEffect(() => {
    listeners.add(setState);
    void library().then(() => setStatus('ready'));
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refresh = useCallback(async () => {
    setStatus('loading');
    await rebuild();
    setStatus('ready');
  }, []);

  const importPack = useCallback(async (file: File): Promise<PendingImport> => {
    const lib = await library();
    const pending = await prepareImport(file, lib.manifests);
    return {
      ...pending,
      commit: async (onProgress) => {
        await pending.commit(onProgress);
        await rebuild();
      },
    };
  }, []);

  // Removal never cascades: overlays of a removed base stay installed and simply
  // list as incompatible ("base companion isn't installed") until the base
  // returns. Threads are untouched either way.
  const removePack = useCallback(async (key: string) => {
    await removePackTree(key);
    await rebuild();
  }, []);

  // Resolve a pick to a playable Companion. Everything it needs is already in
  // the index — no I/O, no object URLs minted here (those happen on first
  // render), so a variant switch is synchronous in all but name.
  const resolveVariant = useCallback(
    async (
      entry: LibraryEntry,
      baseKey: string | null,
      overlayKey: string | null,
    ): Promise<Companion | null> => {
      const lib = await library();
      const content = (key: string) => {
        const c = lib.content.get(key);
        if (c === undefined) {
          throw new PackError(
            'The pack is gone from browser storage — re-import its zip.',
          );
        }
        return c;
      };
      if (overlayKey === null) {
        return baseKey === null
          ? resolveDefault(entry.companion)
          : packToCompanion(content(baseKey));
      }
      const base =
        baseKey === null
          ? entry.companion
          : packToCompanionRaw(content(baseKey));
      return applyOverlay(base, content(overlayKey));
    },
    [],
  );

  return {
    status,
    entries: state.entries,
    packs: state.rows,
    importPack,
    removePack,
    resolveVariant,
    refresh,
  };
}
```

`resolveVariant` keeps its `Promise<Companion | null>` signature (the panel
awaits it), but never returns null now — the overtaken-pick bookkeeping went
with the object-URL churn. Leave the `| null` in place so the call site is
unchanged.

- [ ] **Step 4: Show import progress in the panel**

In `goonpacks-panel.tsx`:

- `const [progress, setProgress] = useState<ImportStage | null>(null);`
- The Import button's `onClick`:

```tsx
                    onClick={() => {
                      setProgress({
                        phase: 'extracting',
                        bytes: 0,
                        total: 1,
                      });
                      void pendingImport
                        .commit(setProgress)
                        .then(() => {
                          setPendingImport(null);
                          setProgress(null);
                        })
                        .catch((e: unknown) => {
                          setPendingImport(null);
                          setProgress(null);
                          setImportError(
                            e instanceof PackError
                              ? e.problems
                              : ['Import failed.'],
                          );
                        });
                    }}
                    disabled={progress !== null}
```

- Under the buttons, while `progress !== null`:

```tsx
{
  progress !== null && (
    <p className="mt-1 text-sm">
      {progress.phase === 'checking'
        ? 'Checking the pack…'
        : `Unpacking… ${Math.round((progress.bytes / Math.max(progress.total, 1)) * 100)}%`}
    </p>
  );
}
```

- Disable Cancel while `progress !== null` too (extraction has no cancel).
- The `Card title="Import"` copy becomes:
  `Packs are unpacked into your browser's storage; keep your zips.`
- `PackRow` now comes from `@/hooks/use-goonpack-library` as before — no import
  change needed.

The confirm sheet's synthetic row loses `summary` (the media count isn't known
until the tree exists). `PackCard` already treats `row.summary` as optional, so
the sheet simply shows the manifest-derived info line; the installed row that
follows shows the counts. Delete the `summary: pendingImport.summary` line.

- [ ] **Step 4b: Tell "still loading" apart from "missing"**

Until now `load()` resolved instantly (the zip library pre-filled `src`), so
`useMediaUrl` returning `null` could only mean "not in the loaded set". From
this phase on it is genuinely async, and the first paint of every picture and
video returns `null` while the file is being opened — which would flash "Media
from another pack." before the media appears. Give the hook three states rather
than two.

`src/hooks/use-media-url.ts`:

```ts
// A media entry's object URL, minted on first use. The entry memoises the URL
// on itself, so a re-render — or a second bubble showing the same item — is
// ready on its first paint; only the very first use of a file is `loading`.
// `missing` means the file is not in the loaded set (or has gone from storage):
// the caller renders a placeholder, never a substitute.
export type MediaUrl =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'missing' };

export function useMediaUrl(media: CompanionMedia | null): MediaUrl {
  const [state, setState] = useState<MediaUrl>(() =>
    media === null
      ? { status: 'missing' }
      : media.src !== undefined
        ? { status: 'ready', src: media.src }
        : { status: 'loading' },
  );
  useEffect(() => {
    if (media === null) {
      setState({ status: 'missing' });
      return;
    }
    if (media.src !== undefined) {
      setState({ status: 'ready', src: media.src });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    void media.load().then(
      (src) => {
        if (live) setState({ status: 'ready', src });
      },
      () => {
        if (live) setState({ status: 'missing' });
      },
    );
    return () => {
      live = false;
    };
  }, [media]);
  return state;
}
```

`media-bubble.tsx` — a loading bubble occupies the thumbnail's space so the
transcript doesn't jump when the file opens:

```tsx
const url = useMediaUrl(media);
if (url.status === 'missing') return <MissingMediaBubble />;
if (url.status === 'loading') {
  return (
    <div className="flex justify-start">
      <div className="ring-foreground/10 bg-foreground/5 h-44 w-44 animate-pulse rounded-2xl ring-1" />
    </div>
  );
}
// …the existing button, using url.src…
```

`lightbox.tsx` — keep rendering the overlay chrome (backdrop, close button,
stage badge) while loading, so opening feels immediate and Escape works before
the file is ready; only the inner frame waits:

```tsx
const url = useMediaUrl(media);
// …all hooks above this line, unchanged…
// Inside the animated inner div, in place of the bare <Image>/<video>:
//   {url.status === 'ready' ? (
//     media.kind === 'video' ? <video src={url.src} … /> : <Image src={url.src} … />
//   ) : null}
```

Do not reintroduce an early `return null` from the whole component — that would
make Escape dead for the moment the file takes to open.

- [ ] **Step 5: Update the e2e**

`tests/e2e/goonpack-import.spec.ts`:

- Fixture: `format: 2`, `'media/one.png'`, `'media/one.txt'`.
- After committing the import, assert the tree and marker exist:

```ts
expect(
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const packs = await root.getDirectoryHandle('goonpacks');
    const dir = await packs.getDirectoryHandle('e2e.testy@1.0.0');
    await dir.getFileHandle('.complete');
    const media = await dir.getDirectoryHandle('media');
    const names: string[] = [];
    for await (const name of media.keys()) names.push(name);
    return names.sort();
  }),
).toEqual(['one.png', 'one.txt']);
```

- After Remove, assert the tree is gone:

```ts
expect(
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const packs = await root.getDirectoryHandle('goonpacks');
    try {
      await packs.getDirectoryHandle('e2e.testy@1.0.0');
      return true;
    } catch {
      return false;
    }
  }),
).toBe(false);
```

- The installed-row assertion text is unchanged
  (`'Testy · complete companion · 1 picture · prompt · voice'`).
- The reload assertion's comment changes from "(IndexedDB)" to "(OPFS)".

- [ ] **Step 5b: Cover the version gate end to end**

The version gate is split across two stages that only meet at runtime, and no
unit test can reach the seam: `prepareImport` rejects some packs from the
**zip's** manifest before extracting a byte, while `parsePack` rejects others
from the **extracted tree** and then deletes it. A `PackTree` test starts from a
tree that already exists, so it can say nothing about whether extraction was
correctly skipped or whether a failed tree was cleaned up. Both are load-bearing
— the first is what stops a multi-gigabyte old pack being written to disk before
being refused, the second is the "a tree that fails deletes itself" rule.

Add to `tests/e2e/goonpack-import.spec.ts`. Reuse the existing `TINY_PNG` and
add a helper so each case is one `zipSync` call:

```ts
// A pack zip built to order. `format` and the media folder's name are the two
// axes the version gate turns on.
function packZip(
  manifest: Record<string, unknown>,
  media: Record<string, Uint8Array> = {},
): Buffer {
  return Buffer.from(
    zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'system-prompt.md': strToU8('You are Testy.'),
      ...media,
    }),
  );
}

const v1Manifest = (extra: Record<string, unknown> = {}) => ({
  format: 1,
  id: 'e2e.oldpack',
  version: '1.0.0',
  aboutThePack: 'a format 1 pack',
  companion: { name: 'Oldie', voiceId: 'v-e2e' },
  ...extra,
});

// Import a zip and return the error lines the panel showed, or [] on success.
async function importZip(
  page: import('@playwright/test').Page,
  name: string,
  buffer: Buffer,
): Promise<string[]> {
  await page
    .getByTestId('goonpack-file-input')
    .setInputFiles({ name, mimeType: 'application/zip', buffer });
  const confirm = page.getByRole('button', { name: 'Import', exact: true });
  if ((await confirm.count()) > 0) {
    await confirm.click();
    await expect(confirm).toHaveCount(0);
  }
  return page.locator('.text-red-500').allTextContents();
}

// Does OPFS hold a tree for this key?
const treeExists = (page: import('@playwright/test').Page, key: string) =>
  page.evaluate(async (k) => {
    const root = await navigator.storage.getDirectory();
    try {
      const packs = await root.getDirectoryHandle('goonpacks');
      await packs.getDirectoryHandle(k);
      return true;
    } catch {
      return false;
    }
  }, key);

test('the version gate accepts and refuses format 1 packs by what they use', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Goonpacks' }).click();

  // A format 1 pack with no media is a format 2 pack in every respect.
  expect(await importZip(page, 'old-clean.zip', packZip(v1Manifest()))).toEqual(
    [],
  );
  await expect(page.getByText('Oldie · complete companion')).toBeVisible();
  expect(await treeExists(page, 'e2e.oldpack@1.0.0')).toBe(true);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  // A format 1 pack that used noPictures is refused from the zip's manifest
  // alone — nothing is extracted, so no tree is ever created.
  expect(
    await importZip(
      page,
      'old-nopictures.zip',
      packZip(v1Manifest({ base: 'autogoon.aimee', noPictures: true })),
    ),
  ).toEqual([
    'This pack uses the old pictures/ layout — rebuild it with a media/ folder and "format": 2.',
  ]);
  expect(await treeExists(page, 'e2e.oldpack@1.0.0')).toBe(false);

  // A format 1 pack with a pictures/ folder is only knowable from the tree, so
  // it extracts, fails validation, and deletes itself.
  expect(
    await importZip(
      page,
      'old-pictures.zip',
      packZip(v1Manifest(), {
        'pictures/one.png': new Uint8Array(TINY_PNG),
        'pictures/one.txt': strToU8('a test picture'),
      }),
    ),
  ).toEqual([
    'This pack uses the old pictures/ layout — rebuild it with a media/ folder and "format": 2.',
  ]);
  expect(await treeExists(page, 'e2e.oldpack@1.0.0')).toBe(false);
  await expect(page.getByText('No packs imported.')).toBeVisible();

  // A format this app doesn't have yet is refused outright.
  expect(
    await importZip(
      page,
      'future.zip',
      packZip({ ...v1Manifest(), format: 3 }),
    ),
  ).toEqual(['This pack needs a newer version of the app.']);
});
```

Two things to get right while writing this: the panel renders import errors as
`<p className="mt-1 text-sm text-red-500">`, so `.text-red-500` is the selector
for the error lines — if you changed that markup in Step 4, update the helper to
match. And the confirm sheet only appears when `prepareImport` succeeded, which
is exactly why `importZip` checks for the button rather than assuming it: the
`noPictures` and `format: 3` cases fail before a sheet is ever shown, and that
difference is part of what these cases prove.

- [ ] **Step 6: Run everything — the whole task's gate**

This is the first point since Phase A where the branch is expected to be green.

```bash
npm test && npm run typecheck && npm run lint
npx playwright test tests/e2e/goonpack-import.spec.ts tests/e2e/goonpack-storage.spec.ts
```

Expected: unit tests, typecheck and lint clean; both e2e specs pass on chromium,
firefox and webkit. `goonpack-storage.spec.ts` was written in Phase B and runs
for the first time here — the clean pass it asserts only reaches app load now
that the rewritten hook calls `sweepIncomplete()`.

- [ ] **Step 7: Format and commit**

```bash
npm run format
git add -A
git commit -m "Goonpacks: import extracts to OPFS; the library reads trees"
```

- [ ] **Step 8: Hand over for browser verification**

Report that the task is done and that the app is ready to be driven with a real
pack. **Your human partner runs this** — it needs pack content that isn't in the
repo. Say what to look for: `npm run dev`, import a large pack with at least one
`.mp4`, and confirm the progress line climbs, the row lists "N pictures · M
videos", a reload re-lists without a stall, and Remove empties it. Do not
attempt it yourself.

---

## Task 4: Extract in a Worker

Extraction is seconds of work, but far too much to block the main thread. Move
the call into a dedicated Worker and report progress back over messages. Nothing
about `extractZip` itself changes.

**Files:**

- Create: `src/lib/goonpacks/extract-worker.ts`
- Modify: `src/lib/goonpacks/import.ts`

**Interfaces:**

- Consumes: `extractZip` (`./extract`).
- Produces:
  - Worker protocol in: `{ file: File; dir: FileSystemDirectoryHandle }`
  - Worker protocol out:
    `{ type: 'progress'; bytes: number } | { type: 'done' } | { type: 'error'; message: string }`
  - `import.ts`:
    `function extractInWorker(file: File, dir: FileSystemDirectoryHandle, onProgress: (bytes: number) => void): Promise<void>`

`File` and `FileSystemDirectoryHandle` are both structured-cloneable, so the
worker gets the handle and the lazily-read file without copying bytes.

- [ ] **Step 1: Write the worker**

`src/lib/goonpacks/extract-worker.ts`:

```ts
// Extraction off the main thread. It is seconds of work rather than minutes —
// nothing crosses a network — but it is CPU-bound inflation plus thousands of
// disk writes, and the UI has an import progress line to keep painting.
import { extractZip } from './extract';

export type ExtractRequest = {
  file: File;
  dir: FileSystemDirectoryHandle;
};

export type ExtractMessage =
  | { type: 'progress'; bytes: number }
  | { type: 'done' }
  | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<ExtractRequest>) => {
  const { file, dir } = event.data;
  const post = (m: ExtractMessage) => {
    self.postMessage(m);
  };
  void extractZip(file, dir, (bytes) => {
    post({ type: 'progress', bytes });
  }).then(
    () => {
      post({ type: 'done' });
    },
    (e: unknown) => {
      post({
        type: 'error',
        message: e instanceof Error ? e.message : 'failed',
      });
    },
  );
};
```

- [ ] **Step 2: Call it from `import.ts`**

Add above `prepareImport`:

```ts
// Run extraction in a dedicated worker, resolving when the tree is written.
// The worker is created per import and terminated either way — extraction is
// the only thing it does.
function extractInWorker(
  file: File,
  dir: FileSystemDirectoryHandle,
  onProgress: (bytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extract-worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ExtractMessage>) => {
      const m = event.data;
      if (m.type === 'progress') onProgress(m.bytes);
      else {
        worker.terminate();
        if (m.type === 'done') resolve();
        else reject(new PackError("The zip couldn't be read."));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new PackError("The zip couldn't be read."));
    };
    worker.postMessage({ file, dir } satisfies ExtractRequest);
  });
}
```

Import the types:
`import type { ExtractMessage, ExtractRequest } from './extract-worker';`
(type-only, so the worker module isn't pulled into the main bundle).

In `commit`, swap the direct call:

```ts
await extractInWorker(file, dir, (bytes) =>
  onProgress?.({ phase: 'extracting', bytes, total: file.size }),
);
```

`extract.ts` keeps exporting `extractZip` — the worker is its only caller, and
`peekZip` still runs on the main thread (it reads kilobytes).

- [ ] **Step 3: Verify the worker actually builds**

```bash
npm run build
```

Expected: a clean production build. If Next reports it cannot resolve the worker
URL, the cause is the `new URL(..., import.meta.url)` form — it must be written
inline in the `new Worker(...)` call, not hoisted to a variable, for the bundler
to see it.

- [ ] **Step 4: Run the e2e**

```bash
npx playwright test tests/e2e/goonpack-import.spec.ts
```

Expected: PASS on all three engines — same behaviour, different thread.

- [ ] **Step 5: Hand over for browser verification**

**Your human partner runs this**, not you — it needs pack content that isn't in
the repo. Report that the task is done and say what to look for: `npm run dev`,
import a large pack, and confirm the progress percentage animates smoothly and
the tab stays responsive (scroll the page while it runs). Before this task it
would freeze.

- [ ] **Step 6: Gate and commit**

```bash
npm test && npm run typecheck && npm run lint && npm run format
git add -A
git commit -m "Goonpacks: extract in a worker, with progress"
```

---

## Task 5: Docs, the example pack, and the changelog

Everything the change made stale.

**Files:**

- Modify: `GOONPACKS.md`
- Modify: `ARCHITECTURE.md:263-291`
- Modify: `DEVELOPERS.md:126-135`
- Modify: `README.md:36-48`
- Modify: `modes/COMPANIONS.md:85-152`
- Modify: `goonpacks/elise/manifest.json`, `goonpacks/elise/system-prompt.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Rewrite the pack-format docs**

`GOONPACKS.md`:

- The intro's "a `pictures/` folder if they send pictures" → "a `media/` folder
  if they send pictures or videos".
- The layout block:
  `media/  optional. Their pictures and videos, with a caption file each`.
- `"format": 1` → `2` in both example manifests, and the `format` bullet, which
  gains: a pack still on `1` imports unchanged if it has no `pictures/` folder
  and no `noPictures` field — the two things the formats differ over — and
  otherwise says what to rebuild.
- The overlay bullet list: "add pictures or videos (or strip the base's, with
  `noMedia`)".
- `noPictures` → `noMedia` throughout, with its meaning unchanged.
- `{{PICTURES_SECTION}}` → `{{MEDIA_SECTION}}`, described as "how they choose
  and send pictures and videos. Only filled in when they actually have some, so
  it's safe to include either way."
- Replace the `## pictures/` section with:

```markdown
## media/

The companion's pictures and videos, directly in `media/` (no subfolders).

- **Pictures:** `.jpg`, `.jpeg`, `.png` or `.webp`.
- **Videos:** `.mp4` or `.webm`. `.mov` is rejected — it plays in Safari and
  unreliably everywhere else, so a `.mov` pack would work on your machine and
  not on someone else's. Re-encode it as MP4.

Beside each one goes a `.txt` file with the same name (`beach.jpg` →
`beach.txt`) holding a one-line caption — they read the captions to choose what
fits the moment, so a good caption says what's actually in the shot. Something
without a caption still works; they just know nothing about it.

Two files can't share a name across types (`beach.jpg` and `beach.mp4`) — the
conversation refers to them by name, so one name means one thing.
```

- The "Building the zip" section: note that `npm run goonpack:describe-missing`
  captions pictures only, and video captions are written by hand.
- The storage paragraph in the intro and in "Importing and versions": packs are
  **unpacked** into the browser's storage at import, the zip isn't kept, and if
  the browser clears its storage the app forgets the pack — keep your zips.
- "A sent picture stays in the conversation…" → "A sent picture or video
  stays…".
- Import copy: the confirm card is shown from the pack's manifest before
  anything is written; the unpack runs after you confirm, with a progress line.

- [ ] **Step 2: Rewrite the Architecture section**

`ARCHITECTURE.md`'s Goonpacks section. Replace the first two bullets with the
current shape, keeping the pointer style (link the file, don't restate the
code):

```markdown
- **Extracted once, verified at every load.** A pack is unzipped at import into
  one OPFS directory tree per `id@version`
  ([`src/lib/goonpacks/store.ts`](./src/lib/goonpacks/store.ts)); a marker file
  written last is what makes the tree an installed pack, so an interrupted
  import or removal leaves the same state and one clean pass at load deletes
  both. Nothing derived is persisted anywhere: every load re-runs `parsePack`
  over the trees, so "installed" is re-derived against the current rules and a
  pack that fails lists as incompatible with its reasons, healing when the cause
  is fixed. Media bytes are never resident — validation is a pass over **names**
  (only the manifest, the prompt and the captions are read), and a file becomes
  an object URL on first render, not at load.
- **A pure lib under a stateful hook.** `src/lib/goonpacks/` (manifest
  parsing/validation, tree validation, the library index, shared-prompt fill,
  pack→`Companion` resolution, chooser entries) is React-free and unit-tested —
  [`library.ts`](./src/lib/goonpacks/library.ts) takes its tree source as an
  argument, which is how the whole load pass is tested without OPFS.
  [`src/hooks/use-goonpack-library.ts`](./src/hooks/use-goonpack-library.ts) is
  the React face of one session-wide index: two screens hold the hook, and a
  media file's object URL is minted once and lives as long as its index entry.
- **Import runs in a worker.** The zip is streamed straight to disk with
  backpressure ([`extract.ts`](./src/lib/goonpacks/extract.ts)), never held
  whole, off the main thread
  ([`extract-worker.ts`](./src/lib/goonpacks/extract-worker.ts)); the zip is
  transport and isn't kept.
```

Update the "Sent pictures persist as stable `goonpack:` refs" sentence to say
"Sent pictures and videos".

- [ ] **Step 3: Update the rest of the prose**

- `DEVELOPERS.md` "Goonpack sources": `goonpacks/<dir>/media/` and a note that
  the captioners skip videos.
- `README.md`: "Given pictures and videos (bring your own)…" and the goonpack
  one-liner gains videos.
- `modes/COMPANIONS.md` "Pictures" → "Pictures and videos": the tool is
  `send_media`, it lists stills and videos together with one caption each, a
  video plays inline in the transcript and full-size in the lightbox, and the
  shared media prompt block is interpolated only when they have some.

- [ ] **Step 4: Rebuild the example pack**

- `goonpacks/elise/manifest.json`: `"format": 2`.
- `goonpacks/elise/system-prompt.md`: `{{PICTURES_SECTION}}` →
  `{{MEDIA_SECTION}}` if it carries the token.

```bash
npm run goonpack:build
```

Expected: `elise: 0 errors`. (`goonpacks/*.zip` is gitignored; only the source
directory is committed.)

- [ ] **Step 5: Write the changelog entry**

At the top of `CHANGELOG.md`, under a new `## 2026-07-26`:

```markdown
- feature: **Companions can send you videos** — A goonpack's `media/` folder now
  holds video as well as stills: `.mp4` and `.webm` videos sit alongside
  pictures with the same one-line captions, and a companion picks between them
  the same way. A video plays inline in the conversation and full-size when you
  open it.

- enhancement: **Packs are unpacked, not stored whole** — Importing a pack now
  unzips it into browser storage once, with a progress bar, instead of keeping
  the zip and re-reading it every time. Packs of hundreds of megabytes — or
  gigabytes, with video — load without the app reading a single picture: it
  reads the captions and nothing else, and only opens a file when it's about to
  show it. Starting the app is no longer slower for every pack you own.

- internal: **Goonpack storage is OPFS trees** — Each installed pack is an OPFS
  directory tree keyed `id@version`, extracted in a worker, verified by
  name-level validation, and made real by a marker file written last; a
  markerless tree is an interrupted import or removal and is deleted by one
  clean pass at load. `pictures/` becomes `media/`, `noPictures` becomes
  `noMedia`, `{{PICTURES_SECTION}}` becomes `{{MEDIA_SECTION}}` and the pack
  format is `2`. Installed packs are not carried over — re-import your zips.
```

Add the PR link (`([#N](https://github.com/autogoon/autogoon/pull/N))`) to each
entry once the PR exists.

- [ ] **Step 6: Run the doc and personal checks**

```bash
npm run format
```

Then run the `/doc-check` skill over the branch's diff, and `/personal-check`
over the branch. Fix what they find.

- [ ] **Step 7: Full gate**

```bash
npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

Expected: everything green. `npm run build` catches RSC issues the dev server
tolerates, and is the one place the worker bundling is proven.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Goonpacks: document media packs and OPFS storage"
```

---

## Task 5b: Move the local pack sources to the new layout

The working copy carries pack sources that are **gitignored** —
`goonpacks/<dir>/` for everything except `elise/`, per the `.gitignore` rule.
They are still on the old layout, so nothing rebuilds and the app has nothing
real to import. Nothing in this task is committed: it is a working-copy fixup
whose only output is the rebuilt zips (also gitignored).

**Files:** nothing under version control. `goonpacks/*/pictures/` →
`goonpacks/*/media/`, `goonpacks/*/manifest.json` format bump, and the rebuilt
`goonpacks/*.zip`.

**Prerequisite:** Task 3 (the build script reads `media/`) and Task 5 (the
example pack is already on `format: 2` — leave `elise/` alone here, it was
handled there).

- [ ] **Step 1: Survey what's actually there**

```bash
for d in goonpacks/*/; do
  echo "=== $d"
  ls "$d"
  ls "$d/pictures" 2>/dev/null | sed 's/.*\.//' | tr 'A-Z' 'a-z' | sort | uniq -c
done
```

Expect the committed example pack (`elise/`) to hold no media, and every other
directory to hold a `pictures/` folder of image files plus `txt` sidecars. Read
the output rather than assuming it — this is a working copy, and what's in it is
whatever its owner put there. If an unsupported extension shows up, re-encode or
delete that file before continuing; if a stem collision shows up
(`ls "$d/pictures" | grep -viE '\.txt$' | sed 's/\.[^.]*$//' | sort | uniq -d`),
rename one side.

- [ ] **Step 2: Rename the directories**

```bash
for d in goonpacks/*/; do
  if [ -d "$d/pictures" ]; then
    mv "$d/pictures" "$d/media"
    echo "renamed $d"
  fi
done
```

These are gitignored paths, so use plain `mv` — not `git mv`.

- [ ] **Step 3: Bump each manifest to format 2**

For every `goonpacks/*/manifest.json` **except** `elise/` (already done in Task
8), change `"format": 1` to `"format": 2`. Check each file by eye rather than
running a blanket `sed` — a pack may also carry `noPictures`, which must become
`noMedia`:

```bash
grep -n '"format"\|"noPictures"' goonpacks/*/manifest.json
```

- [ ] **Step 4: Rebuild**

```bash
npm run goonpack:build
```

Expected: `<dir>: 0 errors` and `built, <dir>.zip` for every pack directory. A
pack that reports errors is telling you something real about its contents — fix
the pack, not the script.

- [ ] **Step 5: Hand over for browser verification**

**Your human partner runs this**, not you. Report that the packs are rebuilt and
say what to look for. `npm run dev`, then import the largest rebuilt zip
(`ls -S goonpacks/*.zip | head -1`) on the Goonpacks tab. Confirm the progress
line climbs, the row lists its picture count, a reload re-lists it quickly, and
picking the companion on the Companions screen shows the right feature line. If
that zip runs to gigabytes, this is the real proof of the whole branch: a pack
the old zip-in-IndexedDB path could not hold at all.

- [ ] **Step 6: No commit**

Nothing here is tracked. Confirm it:

```bash
git status --porcelain
```

Expected: empty. If anything shows up, it escaped `.gitignore` — do not commit
it (the repo is public and these packs are personal content); fix the ignore
rule instead.

---

## Deliberate decisions worth a reviewer's attention

These go beyond a literal reading of the spec. Raise them at review rather than
discovering them in the diff:

1. **`send_picture` becomes `send_media`.** The spec renames the prompt section
   and says videos are chosen and sent exactly as stills are; a tool literally
   named `send_picture` that sends a video would be a lie to the model. The
   thread turn's `imageSrc` becomes `mediaRef` for the same reason. Both are
   sanctioned by the spec's "existing threads' picture references are not
   preserved".
2. **The import confirm sheet no longer shows media counts.** They are a
   property of the extracted tree, and nothing is written before you confirm.
   The sheet shows what the manifest says; the installed row that follows shows
   the counts. Alternative considered and rejected: extract first, then confirm
   — which would clobber the pack being replaced before the user agreed to it.
3. **`PackSummary` splits `images` and `videos`.** The spec says "media counts";
   one number would have to be labelled "3 media", which reads badly and hides
   the thing a user cares about. `describeMedia` renders "3 pictures · 2 videos"
   in both surfaces.
4. **The library index is a module-level singleton.** Required by "a URL lives
   as long as its index entry" once two screens hold the hook. See the note
   under File Structure.
5. **`library.ts` takes its tree source as an argument.** This is what makes the
   whole load pass — cross-pack rules included, which have never had tests —
   unit-testable in the node Jest environment.
6. **`tsconfig.json` gains `DOM.AsyncIterable`.** Without it,
   `FileSystemDirectoryHandle.entries()` does not typecheck.
7. **`send_media` takes an optional `kind`, validated rather than filtering.**
   One flat numbered list over everything, each entry tagged `(picture)` or
   `(video)`; `kind` states what the companion meant and the call is refused on
   mismatch. Per-kind numbering was considered and rejected: it makes `which`
   mean different things depending on another argument. Requested by the human
   partner after Task 2 landed.
8. **The word is "video", never "clip".** Branch-wide, in code, comments, UI
   copy and docs — the design spec's "clip" is superseded. "Video" is what
   people actually say, and "clip" collides with clipping/clip-path in a
   codebase full of CSS. `MediaKind`'s values stay `'image' | 'video'`.
9. **A format 1 pack is accepted when it means the same thing as a format 2
   one** — no `pictures/` folder, no `noPictures`. The spec says "no backwards
   compatibility", and this is not compatibility: the formats differ in exactly
   those two things, so such a pack is already format 2. It costs the format
   gate its manifest-only purity (the tree half moves into `parsePack`), and it
   buys every voice-only and colour-only overlay — and the example pack — a
   rebuild they'd otherwise be told to do for no reason. Decided by the human
   partner after Task 1, on seeing
   `elise: 1 error … uses the old pictures/ layout` for a pack with no pictures.
10. **Extraction lands on the main thread in Task 3 and moves into a worker in
    Task 4.** Same function, called from a different thread — it keeps the OPFS
    switch reviewable and gives the worker move an unambiguous before/after.
