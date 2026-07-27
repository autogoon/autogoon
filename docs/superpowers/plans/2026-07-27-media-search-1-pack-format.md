# Pack format 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `parsePack` the single authority on what a pack may contain,
validating the tree that actually ships, and leave the pack format with exactly
one accepted value, numbered 1.

**Architecture:** Two trees exist today — the one an author has on disk, and the
hand-picked subset `goonpack-build.ts` feeds the validator — and every awkward
thing here falls out of the gap. `parsePack` skips any path outside `media/`
rather than judging it, so the build needs a bespoke `pictures/` check the
validator structurally cannot make, and a `media/` subfolder silently truncates
a pack. Tasks 1 and 2 close the gap: the validator judges every path, and the
build walks the source and ships what it validated. Tasks 3 and 4 then delete
the format 1 compatibility path, whose tree half is redundant once an
unrecognised folder is refused whatever the format says.

**Tech Stack:** TypeScript, Jest (unit, colocated), Playwright (e2e,
`tests/e2e/`).

This is Phase 0 of
[the media search design](../specs/2026-07-27-media-search-design.md), and is
independent of every step after it. Steps 1–3 and 4–5 get their own plans.

All three land on `media-search-design`, the branch already carrying the design
and these plans, open as draft PR
[#25](https://github.com/autogoon/autogoon/pull/25) — no branch is made for
them.

## Global Constraints

- **Change files with Edit and Write only** — never `sed -i`, a heredoc, or a
  redirect into a tracked path. A PreToolUse hook denies the shapes it can spot.
- **Zero warnings**: `npm run lint` runs with `--max-warnings 0`. Fix every lint
  and typecheck warning before finishing, including ones the change didn't
  cause.
- **Gates before the PR**: `npm run typecheck`, `npm run lint`,
  `npm run format`, `npm test`, `npm run test:e2e`.
- **A test that cannot fail is removed, not patched.** Behaviour being deleted
  takes its tests with it; a test is only retargeted where the contract it pins
  still exists.
- **CHANGELOG.md is part of the work**, not a follow-up.
- The only accepted format value afterwards is `1`.

## The bug this fixes

`goonpack-build.ts` collects media with `readFileSync` inside a
`try { … } catch { /* no media dir */ }`. `readFileSync` throws `EISDIR` on a
directory, so a subfolder in `media/` is swallowed as "no media dir", the
collection loop exits, and every file sorting after it is dropped. With a
subfolder sorting first, **every** media file is dropped. Nothing downstream
notices: `parsePack` has no rule requiring a complete pack to carry media, so
the build prints a green "0 errors, built" and writes a pack with nothing in it.

Confirmed by reproduction, and shipped on `main` — so it earns a `bug` changelog
entry, not just an `internal` one.

Task 2 fixes it by construction: a recursive walk recurses into a directory
instead of trying to read it, and `parsePack` then refuses the subfolder by the
rule it already has.

## File Structure

| File                                  | Responsibility after the change                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/lib/goonpacks/pack.ts`           | Judges every path in the tree: manifest, prompt, `media/*`, and nothing else. No format branch. |
| `src/lib/goonpacks/store.ts`          | Keeps its completion marker out of the tree it hands to validation.                             |
| `src/lib/goonpacks/manifest.ts`       | `PACK_FORMAT = 1`; `parseManifest` accepts that one value. No `OLD_LAYOUT_PROBLEM`.             |
| `scripts/lib/goonpack-source.ts`      | New. `collectPackFiles` — a pack source directory read whole, as a path → bytes map.            |
| `scripts/goonpack-build.ts`           | Validates what `collectPackFiles` returned, and zips what it validated.                         |
| `jest.config.mjs`                     | `testMatch` reaches `scripts/lib/`, so a script's modules are unit-tested like any other.       |
| `src/lib/goonpacks/pack.test.ts`      | Tree rules, including unrecognised paths.                                                       |
| `src/lib/goonpacks/store.test.ts`     | Tree listing, including the marker's absence from it.                                           |
| `src/lib/goonpacks/manifest.test.ts`  | Format contract: 1 accepted, above refused as newer, below unrecognised.                        |
| `scripts/lib/goonpack-source.test.ts` | New. Which paths in a source on disk reach the validator and the zip.                           |
| `src/lib/goonpacks/library.test.ts`   | Its manifest fixture and the missing-format message, both on `1`.                               |
| `tests/e2e/goonpack-import.spec.ts`   | Import journeys, with no format-1 fixtures.                                                     |
| `tests/e2e/goonpack-storage.spec.ts`  | Its stored-tree fixture, on `1` so it still validates.                                          |
| `goonpacks/elise/manifest.json`       | The tracked example pack, declaring `1`.                                                        |
| `GOONPACKS.md`                        | Documents `format` as always `1`, and what a pack may contain.                                  |
| `CHANGELOG.md`                        | One `bug` entry and one `internal` entry.                                                       |

---

### Task 1: The validator judges every path

**Files:**

- Modify: `src/lib/goonpacks/pack.ts:131-133`
- Modify: `src/lib/goonpacks/store.ts:66-85`
- Test: `src/lib/goonpacks/pack.test.ts`
- Test: `src/lib/goonpacks/store.test.ts:254`

**Interfaces:**

- Consumes: nothing — this is the first task.
- Produces: `parsePack(tree: PackTree): Promise<ParsedPack>` keeps its signature
  and gains one problem string per unrecognised path. `MARKER` stays exported
  from `src/lib/goonpacks/store.ts` as `'.complete'`.

The marker is the trap here. `listTree` walks the whole tree and returns
everything non-junk, and `store.ts` writes `.complete` into the pack directory
once extraction and validation have both succeeded. `isJunkPath` does not filter
it — it matches `._` prefixes, not a leading dot. So a validator that refuses
unrecognised paths refuses **every installed pack** at load unless the store
stops presenting its own bookkeeping as part of the pack. The store owns the
marker, so the store hides it; `parsePack` stays ignorant of it.

- [x] **Step 1: Write the failing tests**

In `src/lib/goonpacks/pack.test.ts`, add to the `parsePack` describe:

```ts
it('names a file that has no place in a pack rather than ignoring it', async () => {
  await expect(
    parsePack(
      tree({
        'manifest.json': complete(),
        'system-prompt.md': 'You are Testy.',
        'notes.md': 'scratch',
      }),
    ),
  ).rejects.toThrow(/notes\.md/);
});

it('names a stray folder by the files inside it, since a folder is only paths', async () => {
  await expect(
    parsePack(
      tree({
        'manifest.json': complete(),
        'system-prompt.md': 'You are Testy.',
        'pictures/a.jpg': '',
      }),
    ),
  ).rejects.toThrow(/pictures\/a\.jpg/);
});
```

A third test guarding the wrapper-folder message was planned and not written:
`names the wrapper folder when the folder was zipped instead of its contents`
already takes the identical path through `parsePack`, so it guards Step 3
against the same regression and a second one would be a duplicate.

In `src/lib/goonpacks/store.test.ts`, extend the `openPackTree` describe, using
the `seed` helper the tests there already build trees with:

```ts
it('leaves the completion marker out, so validation never sees the store keeping notes', async () => {
  seed('pub.pack@1.0.0', { 'manifest.json': '{}' });
  await markComplete('pub.pack@1.0.0');
  expect((await openPackTree('pub.pack@1.0.0'))?.names).toEqual([
    'manifest.json',
  ]);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/goonpacks/pack.test.ts src/lib/goonpacks/store.test.ts`

Expected: FAIL on the two new `parsePack` rejection tests (nothing throws — the
stray paths are skipped) and on the marker test (`.complete` is listed). All
three failed as described.

- [x] **Step 3: Make the validator judge every path**

In `src/lib/goonpacks/pack.ts`, the media loop opens with a skip. Replace:

```ts
  for (const path of names) {
    if (!path.startsWith(MEDIA_DIR)) continue;
```

with:

```ts
  // Every path is either the manifest, the prompt, something under media/, or
  // something that has no place in a pack. Skipping the last of those is what
  // let a stray folder ride along unnoticed into a built pack.
  for (const path of names) {
    if (path === MANIFEST || path === PROMPT) continue;
    if (!path.startsWith(MEDIA_DIR)) {
      problems.push(
        `${path} doesn't belong in a pack — a pack holds manifest.json, system-prompt.md and a media/ folder.`,
      );
      continue;
    }
```

The wrapper-folder throw above this loop is untouched and still fires first,
because it runs when `manifest.json` is missing from the root and throws rather
than collecting problems.

- [x] **Step 4: Keep the marker out of the tree**

In `src/lib/goonpacks/store.ts`, `listTree` pushes every non-junk file. Change
its filter so the marker never reaches validation:

```ts
      } else if (!isJunkPath(path) && path !== MARKER) {
        names.push(path);
      }
```

Update `listTree`'s comment, which currently promises "root files plus one level
of media/":

```ts
// Every file in a pack's tree, as validation sees it: the pack's own files,
// with this module's completion marker left out. Deeper nesting is listed so
// parsePack can reject it by name.
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test`

Expected: PASS, whole suite. A failure elsewhere means a fixture carries a path
the validator now refuses — fix the fixture, not the rule. The unit suite passed
whole; `npm run test:e2e` does not, and cannot until Task 3 — the two
`pictures/` import tests now collect a "doesn't belong in a pack" problem per
file alongside the old-layout one they assert, and Task 3 is what deletes them.
The e2e suite is green again from Task 3 onwards.

- [x] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add src/lib/goonpacks/pack.ts src/lib/goonpacks/store.ts \
  src/lib/goonpacks/pack.test.ts src/lib/goonpacks/store.test.ts
git commit -m "Packs: the validator judges every path, not just the ones under media/"
```

---

### Task 2: The build ships what it validated

**Files:**

- Create: `scripts/lib/goonpack-source.ts`
- Create: `scripts/lib/goonpack-source.test.ts`
- Modify: `scripts/goonpack-build.ts:58-96`
- Modify: `jest.config.mjs`

**Interfaces:**

- Consumes: `parsePack` from Task 1, which now refuses unrecognised paths.
- Produces: `collectPackFiles(dir: string): Record<string, Uint8Array>`, the
  walk on its own, exported from `scripts/lib/goonpack-source.ts`.

The walk is the whole of the defect, so it is the unit under test, and a
top-level script that runs on import is not one. `scripts/` holds what is run
and `scripts/lib/` what those import, which is where it goes: it imports
`node:fs`, and nothing under `src/` does — `PackTree`'s own comment already puts
the fs-backed side of that type in the authoring script rather than the app.
Jest's `testMatch` covers `src/**` only, so it gains `scripts/lib/**/*.test.ts`.

- [x] **Step 1: Extract the walk into a module of its own**

The current collection names three things explicitly and reads media with a
`readFileSync` that throws on a directory. Replace the `add` helper and the
three collection blocks with `collectPackFiles(dir)`, whose body is one
recursive walk:

```ts
export function collectPackFiles(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  // A directory is recursed into, never read: readFileSync throws EISDIR on
  // one, and the paths below it are what lets parsePack name a folder that has
  // no place in a pack.
  const collect = (rel: string): void => {
    const entries = readdirSync(join(dir, rel === '' ? '.' : rel), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`;
      if (isJunkPath(path)) continue;
      if (e.isDirectory()) collect(path);
      else files[path] = new Uint8Array(readFileSync(join(dir, path)));
    }
  };
  collect('');
  return files;
}
```

- [x] **Step 1a: Test it against a real directory**

The walk's job is the filesystem, so `scripts/lib/goonpack-source.test.ts`
builds a source under `mkdtempSync` and asserts the paths that come back:

- every file the source holds, including one that has no place in a pack — what
  the validator judges and what the zip carries are the same map;
- the media files that sort after a subfolder, plus the subfolder's own
  contents, which is the defect itself;
- macOS junk left out.

Judging those paths stays `parsePack`'s, and `pack.test.ts`'s.

- [x] **Step 2: Delete the `pictures/` special case**

It exists only because the validator could not see the folder. Delete the whole
block, including its comment:

```ts
// Only media/ is zipped, so a source still holding pictures/ would build
// into a pack with no media at all — and validate, since the zip has no
// pictures/ folder for the format gate to catch. Refuse it here instead.
if (
  statSync(join(dir, 'pictures'), {
    throwIfNoEntry: false,
  })?.isDirectory() === true
) {
  throw new PackError(
    'This pack source still has a pictures/ folder — rename it to media/.',
  );
}
```

A source still holding `pictures/` now fails through `parsePack`, naming each
file in it. Keep the `statSync` import: the "a directory without a manifest
isn't a pack source" guard above still uses it.

- [x] **Step 3: Verify the bug is fixed end to end**

Step 1a pins the walk; this pins the build the walk feeds. A throwaway source
with a subfolder sorting before the media files, built with the old script and
the new one:

- old script: `zz-scratch: 0 errors`, `built, zz-scratch.zip` — a zip with no
  media in it, reported as a success. This is the shipped defect.
- new script: `zz-scratch: 1 error`,
  `media/ can't contain subfolders — found media/aaa-sub/x.jpg.`, and no zip
  written.

An empty subfolder builds clean under both — an empty directory contributes no
paths, so there is nothing for `parsePack` to refuse.

- [x] **Step 4: Verify every real pack still builds**

Run: `npm run goonpack:build`

Expected: a green status line per pack. A pack that now fails is carrying a file
that was never shipping anyway — read the message and remove the file rather
than loosening the rule.

- [x] **Step 5: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add scripts/goonpack-build.ts scripts/lib/goonpack-source.ts \
  scripts/lib/goonpack-source.test.ts jest.config.mjs
git commit -m "goonpack:build: walk the source, validate it, ship what was validated"
```

---

### Task 3: One accepted pack format, numbered 1

Code and every test that covers it, in one task: `pack.ts` will not compile once
`OLD_LAYOUT_PROBLEM` is gone, and leaving the e2e suite red between tasks would
mean neither task ends on a green gate.

**Files:**

- Modify: `src/lib/goonpacks/manifest.ts:50-55`, `:130-145`
- Modify: `src/lib/goonpacks/pack.ts` — the import block and the format branch
- Test: `src/lib/goonpacks/manifest.test.ts:4-9`, `:25-67`, `:171`
- Test: `src/lib/goonpacks/pack.test.ts:5-12`, and the two format-1 tests
- Test: `src/lib/goonpacks/library.test.ts` — its manifest fixture and the
  missing-format message it asserts
- Test: `tests/e2e/goonpack-import.spec.ts:11-52`, `:185-241`, `:242-257`
- Test: `tests/e2e/goonpack-storage.spec.ts` — the `validPack` fixture

The fixtures beyond `manifest.test.ts` and `pack.test.ts` are the ones a
`format: 2` grep finds. Only these two of them break: a fixture that never
reaches `parseManifest` — `entries`, `extract`, `import`, `resolve`,
`use-goonpack-library` — declares a format nothing reads, and passes either way.

**Interfaces:**

- Consumes: `parsePack` from Task 1, which already refuses a `pictures/` folder
  by path — so the format branch being deleted here has nothing left to catch.
- Produces: `PACK_FORMAT: number` (value `1`) stays exported from
  `src/lib/goonpacks/manifest.ts` with its current name and type.
  `OLD_LAYOUT_PROBLEM` stops being exported.

- [x] **Step 1: Rewrite the unit format contract**

In `src/lib/goonpacks/manifest.test.ts`, change the shared fixture:

```ts
const good = {
  format: 1,
  id: 'g00ner.aimee',
  version: '1.0.0',
  aboutThePack: 'a test pack',
};
```

Delete both format-1 compatibility tests outright — the behaviour they cover is
going, so there is nothing left for them to pin:

- `it('accepts a format 1 manifest with no noPictures field', …)`
- `it('names the old layout when a format 1 pack used noPictures', …)`

Retarget the ones pinning contracts that still exist:

```ts
it('rejects a format newer than the app understands, asking for a newer version of the app', () => {
  expect(() => parseManifest({ format: 2, id: 'a.b', version: '1' })).toThrow(
    /newer version of the app/,
  );
});
it("rejects a format below the one it understands as one it doesn't recognise", () => {
  expect(() => parseManifest({ ...good, format: 0 })).toThrow(
    "This pack uses a format version this app doesn't recognise.",
  );
});
it('rejects a format written as a string in quotes', () => {
  expect(() => parseManifest({ ...good, format: '1' })).toThrow(
    'manifest.json is missing the format field — add "format": 1.',
  );
});
```

And at `manifest.test.ts:171`, change the inline manifest from `format: 2` to
`format: 1`.

- [x] **Step 2: Rewrite the tree-side tests**

In `src/lib/goonpacks/pack.test.ts`, change the fixture builder's `format: 2` to
`format: 1`, and delete both format-1 tests:

- `it('accepts a format 1 pack that carries no media', …)`
- `it('names the old layout when a format 1 pack has a pictures/ folder', …)`

The second is covered by Task 1's stray-folder test, which refuses
`pictures/a.jpg` whatever the manifest declares.

- [x] **Step 3: Run the unit tests to verify they fail**

Run:
`npx jest src/lib/goonpacks/manifest.test.ts src/lib/goonpacks/pack.test.ts`

Expected: FAIL, on exactly two tests.

- `rejects a format newer than the app understands` — `format: 2` is still the
  accepted value, so nothing throws.
- `rejects a format written as a string in quotes` — the message still names
  `2`.

Everything else passes, including
`rejects a format below the one it understands`: `0` already falls through to
the "doesn't recognise" branch. That one is retargeted rather than new, so it
passing here is correct.

- [x] **Step 4: Make the change in `manifest.ts`**

Set the constant:

```ts
// The pack-format version this app understands. Bump only with a format change.
export const PACK_FORMAT = 1;
```

Delete the old-layout message and its comment entirely:

```ts
// Formats 1 and 2 differ only in the media folder's name and noPictures, so
// this is what "written for the old format" concretely means.
export const OLD_LAYOUT_PROBLEM =
  'This pack uses the old pictures/ layout — rebuild it with a media/ folder and "format": 2.';
```

Replace the format gate in `parseManifest` with:

```ts
if (typeof m.format !== 'number') {
  throw new PackError(
    'manifest.json is missing the format field — add "format": 1.',
  );
}
if (m.format > PACK_FORMAT) {
  throw new PackError('This pack needs a newer version of the app.');
}
if (m.format !== PACK_FORMAT) {
  throw new PackError(
    "This pack uses a format version this app doesn't recognise.",
  );
}
```

That deletes the `m.format !== PACK_FORMAT && m.format !== 1` compound and the
whole `noPictures` branch beneath it, including its two-line comment.

- [x] **Step 5: Make the change in `pack.ts`**

Drop `OLD_LAYOUT_PROBLEM` from the import so it reads:

```ts
import { PackError, parseManifest, type PackManifest } from './manifest';
```

Delete the tree half of the gate — the comment and the `if` together:

```ts
// The tree half of the format gate (parseManifest holds the other):
// formats 1 and 2 differ only in this folder's name and noPictures, so a
// format 1 pack with neither is a format 2 pack and passes. With a
// pictures/ folder it is genuinely old, and says so rather than reporting
// no media.
if (manifest.format === 1 && names.some((n) => n.startsWith('pictures/'))) {
  problems.push(OLD_LAYOUT_PROBLEM);
}
```

- [x] **Step 6: Run the unit tests to verify they pass**

Run: `npm test`

Expected: PASS, whole suite. `library.test.ts` fails first: its manifest fixture
still declares `2`, so every pack it builds is now refused as needing a newer
app, and one test asserts the missing-format message by its text. Both are the
one-line fixture changes above.

- [x] **Step 7: Rewrite the e2e fixtures**

In `tests/e2e/goonpack-import.spec.ts`, change `completePack`'s manifest from
`format: 2` to `format: 1`, and delete the `v1Manifest` helper entirely. In
`tests/e2e/goonpack-storage.spec.ts`, `validPack` needs the same change — a
stored tree that no longer validates is no longer the fixture that file needs.

Delete these three tests, whose behaviour no longer exists:

- `test('a format 1 pack with no pictures/ folder imports as if it were format 2', …)`
- `test('a format 1 pack that sets noPictures is refused from the manifest, before anything is extracted', …)`
- `test('a format 1 pack with a pictures/ folder extracts, fails validation, and deletes its own tree', …)`

The "newer format" test still pins a live contract but loses its helper, so give
it its own manifest:

```ts
test("a pack whose format is newer than the app's is refused outright", async ({
  page,
}) => {
  await page.goto('/');
  await skipWithoutOpfs(page);
  await page.getByRole('button', { name: 'Goonpacks' }).click();

  expect(
    await importZip(
      page,
      'future.zip',
      packZip({
        format: 2,
        id: 'e2e.future',
        version: '1.0.0',
        aboutThePack: 'a pack from a later app',
        companion: { name: 'Futurey', voiceId: 'v-e2e' },
      }),
    ),
  ).toEqual(['This pack needs a newer version of the app.']);
});
```

`packZip`'s comment describes a gate that no longer has three inputs. Replace it
with:

```ts
// A pack zip built to order: the manifest, a system prompt, and any media given.
```

- [x] **Step 8: Run the e2e suite**

Run: `npm run test:e2e -- goonpack-import`

Expected: PASS on Chromium, Firefox and WebKit. WebKit skips the OPFS-dependent
tests via `skipWithoutOpfs` — a skip there is expected, not a failure. This is
also where the suite goes green again after Task 1 left it red.

- [x] **Step 9: Gates and commit**

```bash
npm run typecheck && npm run lint && npm run format
git add src/lib/goonpacks/manifest.ts src/lib/goonpacks/pack.ts \
  src/lib/goonpacks/manifest.test.ts src/lib/goonpacks/pack.test.ts \
  src/lib/goonpacks/library.test.ts tests/e2e/goonpack-import.spec.ts \
  tests/e2e/goonpack-storage.spec.ts
git commit -m "Pack format: one accepted value, and the old layout path deleted"
```

---

### Task 4: Pack sources, the format's documentation, and the changelog

**Files:**

- Modify: `goonpacks/elise/manifest.json`
- Modify: every other `goonpacks/*/manifest.json` (untracked; see below)
- Modify: `GOONPACKS.md:67`, `:82-90`, `:191`, `:241`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `PACK_FORMAT = 1` from Task 3 — a pack still declaring `2` is
  refused by the validator that `goonpack:build` runs.
- Produces: nothing code-facing.

- [x] **Step 1: Update the tracked pack source**

In `goonpacks/elise/manifest.json`, change `"format": 2` to `"format": 1`.

- [x] **Step 2: Update the untracked pack sources**

`goonpacks/` holds pack sources beyond the tracked example; they are gitignored
and exist only on the author's machine. Each has a `manifest.json` needing the
same one-line change, or it stops building. Find them with:

```bash
grep -l '"format": 2' goonpacks/*/manifest.json
```

Change each with Edit. Nothing here is committed except the tracked example.

- [x] **Step 3: Verify every pack still builds**

Run: `npm run goonpack:build`

Expected: a green status line per pack. The build runs `parsePack`, so a
manifest still declaring `2` fails here with "This pack needs a newer version of
the app." — that is the missed-file signal, not a bug.

- [x] **Step 4: Update GOONPACKS.md**

Change `"format": 2` to `"format": 1` in both JSON examples (`:67` and `:191`).

Replace the `format` bullet, which explains a two-format history that no longer
exists:

```markdown
- **`format`** — always `1`. This is the version of the _pack format_ (so the
  app knows how to read it), not the version of your pack. A pack declaring
  anything else is refused on import.
```

Say what is now enforced: a pack holds `manifest.json`, `system-prompt.md` and
`media/`, and anything else in the zip is refused by name on import. That rule
is new in Task 1 and a pack author needs to know it. It went at the head of
`## Building the zip`, which is where an author reads what goes into the zip;
`## media/` already carries the no-subfolders half and stating the rule in both
places would be two copies to drift.

Leave `:284` alone. It says a stored pack is re-checked at every load and marked
incompatible when "the pack format has moved on" — that describes a future bump,
not the path being deleted, and stays true with one accepted value.

- [x] **Step 5: Add the changelog entries**

Under today's `## YYYY-MM-DD` heading in `CHANGELOG.md`. The `bug` entry comes
first, then `internal`, per the tag order:

```markdown
- bug: **Building a pack could silently drop its media** — A folder inside
  `media/` stopped the build collecting files, and depending on its name that
  could mean losing every picture in the pack. The build reported success and
  wrote the pack anyway, so the first sign of it was a companion with nothing to
  send. Building now refuses a pack that holds anything a pack can't hold,
  naming the file. ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **One pack format, and one tree** — `goonpack:build` hand-picked the
  files it fed the validator, so the validator judged a different tree from the
  one that shipped; it now walks the source, validates that, and zips what it
  validated, with `parsePack` refusing any path that isn't the manifest, the
  prompt or something under `media/`. The two accepted pack-format versions
  become one, numbered `1`: the compatibility path for the older layout is gone
  along with the bespoke check that stood in for the validator not seeing it.
  ([#25](https://github.com/autogoon/autogoon/pull/25))
```

- [x] **Step 6: Gates**

Run: `npm run format && npm test`

Expected: format clean, tests pass. `src/lib/changelog.ts` parses CHANGELOG.md
strictly and `changelog.test.ts` covers the parser, so a malformed entry shows
up there.

- [x] **Step 7: Commit**

```bash
git add goonpacks/elise/manifest.json GOONPACKS.md CHANGELOG.md
git commit -m "Pack format: the example pack and the docs say 1"
```

---

## Before the PR is ready

PR [#25](https://github.com/autogoon/autogoon/pull/25) is a draft while the
three plans land on its branch, so this runs before it is marked ready and again
before merging. Per [CLAUDE.md](../../../CLAUDE.md) → Git workflow, in this
order: `/code-check`, `/test-check`, `/doc-check`, `/style-check`,
`/personal-check`. All five run even where a branch didn't go near their
subject.

`/personal-check` matters more than usual here: Task 4 touches untracked pack
sources, and the plan and any PR text must describe the tracked example only —
never the other sources or what they contain.

Then `git fetch origin && git log --oneline HEAD..origin/main` should be empty
before pushing, and again before merging.
