# Goonpacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Runtime-loaded companion persona packs: import a `.zip` (complete
companion or overlay on an existing one), pick variants in the chooser, cache in
IndexedDB with the zip as source of truth — plus the `goonpack:*` authoring
scripts and the retirement of the build-time picture pipeline.

**Architecture:** A new pure-logic module tree `src/lib/goonpacks/` (manifest
validation, prompt placeholder fill, zip parsing, overlay resolution, storage
reconciliation) under Jest; a React hook + chooser rework in the Companions
panel; Node authoring scripts sharing the `fflate` dependency. Spec:
`docs/superpowers/specs/2026-07-23-goonpacks-design.md`.

**Tech Stack:** TypeScript / Next 16 / React 19, `fflate` (zip, new dep), Jest
(`@jest/globals`, node env, colocated `*.test.ts`), Playwright.

## Global Constraints

- Pack id regex: `^[a-z0-9-]+\.[a-z0-9-]+$` (both halves slugs, single dot).
- Manifest `format` is `1`; greater → error "This pack needs a newer version of
  the app."
- `version` required on every pack; free-form string; never interpreted.
- Complete pack requires `id`, `version`, `name`, `voiceId`, `system-prompt.md`.
- Overlay (`base` present) requires only `id`, `base`, `version`.
- Placeholders `{{NAME}}` map to `shared-prompt.ts` export names; unknown →
  dropped; `{{TOY_STATUS}}`/`{{NOW}}` pass through untouched;
  `{{PICTURES_SECTION}}` fills only when the resolved companion has pictures.
- Overlay sessions use the **base's** id (thread key `companions:thread:<id>`
  follows automatically).
- Removal cascades to overlays only on user action; eviction never deletes
  surviving records.
- IndexedDB stores `{manifest, zip: Blob}` keyed by pack id; localStorage
  `goonpacks:index` is derived, self-healing.
- `accentColour` validates against the globals.css safelist hues: red, orange,
  amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet,
  purple, fuchsia, pink, rose.
- UI copy is terse. Zero lint warnings; `npm run typecheck` + `npm run lint`
  clean before every commit.
- All gates before PR: typecheck, lint, format, `npm test`, `npm run test:e2e`,
  CHANGELOG entry, `/doc-check`, `/personal-check`.

## File structure

```
src/lib/goonpacks/manifest.ts        types, PackError, parseManifest (pure)
src/lib/goonpacks/prompt.ts          fillSharedSections (pure)
src/lib/goonpacks/pack.ts            parsePack: zip bytes → ParsedPack (pure; fflate)
src/lib/goonpacks/resolve.ts         packToCompanion / applyOverlay / resolveDefault (pure)
src/lib/goonpacks/store.ts           IDB + index + reconcile (thin IDB, pure reconcile)
src/lib/goonpacks/migrate.ts         legacy thread-key migration (pure over Storage)
src/hooks/use-goonpack-library.ts    React hook: library state, import/remove/resolve
scripts/goonpack-build.mjs           zips goonpacks/<dir>/ → goonpacks/<id>.zip
tests/e2e/goonpack-import.spec.ts    import flow on all three engines
GOONPACKS.md                         user-facing authoring doc
```

Modified: `src/lib/companions/companions.ts` (autogoon ids, defaults, drop
generated pictures), `elise/aimee/miley-prompt.ts` (`{{PICTURES_SECTION}}`
token), `src/components/play-modes/companions-panel.tsx` (chooser),
`package.json` (dep + scripts), `scripts/describe-missing.mjs` (repoint),
`.gitignore`, `modes/COMPANIONS.md`, `modes/GOON.md`, `DEVELOPERS.md`,
`CHANGELOG.md`. Deleted: `scripts/generate-companion-pictures.mjs`,
`public/companions/.gitkeep` (ignore line stays as a backstop).

---

### Task 1: Manifest types + validation

**Files:**

- Create: `src/lib/goonpacks/manifest.ts`, `src/lib/goonpacks/manifest.test.ts`
- Modify: `package.json` (add `fflate` — used from Task 3 on)

**Interfaces (produces):**

```ts
export class PackError extends Error {}
export type PackManifest = {
  format: number;
  id: string;
  version: string;
  base?: string;
  name?: string;
  description?: string;
  gender?: 'female' | 'male' | 'nonbinary';
  accentColour?: string;
  voiceId?: string;
  model?: string;
  contextWindow?: number;
  passesReasoning?: boolean;
};
export const PACK_ID_RE: RegExp;
export function parseManifest(raw: unknown): PackManifest; // throws PackError
```

- [ ] **Step 1:** `npm install fflate` (runtime dependency; powers browser
      unzip, test zips and the build script).
- [ ] **Step 2: Write failing tests** — `src/lib/goonpacks/manifest.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { PackError, parseManifest } from './manifest';

const good = { format: 1, id: 'g00ner.aimee', version: '1.0.0' };

describe('parseManifest', () => {
  it('accepts a minimal overlay manifest', () => {
    expect(parseManifest({ ...good, base: 'autogoon.aimee' }).base).toBe(
      'autogoon.aimee',
    );
  });
  it('rejects a newer format', () => {
    expect(() => parseManifest({ ...good, format: 2 })).toThrow(PackError);
  });
  it('rejects missing/invalid format', () => {
    expect(() => parseManifest({ ...good, format: undefined })).toThrow(
      PackError,
    );
  });
  it('rejects bad ids', () => {
    for (const id of ['aimee', 'A.b', 'a..b', 'a.b.c', 'a_b.c', '']) {
      expect(() => parseManifest({ ...good, id })).toThrow(PackError);
    }
  });
  it('requires version as a non-empty string', () => {
    expect(() => parseManifest({ ...good, version: '' })).toThrow(PackError);
    expect(() => parseManifest({ ...good, version: 1 })).toThrow(PackError);
  });
  it('rejects a bad base id', () => {
    expect(() => parseManifest({ ...good, base: 'nope' })).toThrow(PackError);
  });
  it('rejects an unknown accentColour', () => {
    expect(() => parseManifest({ ...good, accentColour: 'mauve' })).toThrow(
      PackError,
    );
    expect(parseManifest({ ...good, accentColour: 'teal' }).accentColour).toBe(
      'teal',
    );
  });
  it('rejects a bad gender', () => {
    expect(() => parseManifest({ ...good, gender: 'robot' })).toThrow(
      PackError,
    );
  });
  it('rejects non-object input', () => {
    expect(() => parseManifest('nope')).toThrow(PackError);
  });
});
```

- [ ] **Step 3:** `npx jest src/lib/goonpacks/manifest.test.ts` → FAIL (module
      not found).
- [ ] **Step 4: Implement** `src/lib/goonpacks/manifest.ts`:

```ts
// Goonpack manifest: parsing + validation. Pure — no React, no browser APIs.
// The manifest is the identity/config half of a pack (see
// docs/superpowers/specs/2026-07-23-goonpacks-design.md for the format).

// Terse, user-facing import errors — every message here can surface in the UI.
export class PackError extends Error {}

// publisher.name — both halves strict slugs, single dot. Ids end up in storage
// keys and thread keys, so the charset is locked down at the format level.
export const PACK_ID_RE = /^[a-z0-9-]+\.[a-z0-9-]+$/;

// The accent hues safelisted in globals.css — a pack colour outside this set
// would silently render unstyled, so reject it at import instead.
const ACCENT_COLOURS = new Set([
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]);

const GENDERS = new Set(['female', 'male', 'nonbinary']);

// The pack-format version this app understands. Bump only with a format change.
export const PACK_FORMAT = 1;

export type PackManifest = {
  format: number; // pack-format version (not the pack's own version)
  id: string; // publisher.name — unversioned identity
  version: string; // author's own version; displayed as-is, never interpreted
  base?: string; // overlay only: id of the companion it modifies
  name?: string;
  description?: string;
  gender?: 'female' | 'male' | 'nonbinary';
  accentColour?: string;
  voiceId?: string; // ElevenLabs voice id (account-scoped, see spec)
  model?: string; // OpenRouter slug; app default when omitted
  contextWindow?: number;
  passesReasoning?: boolean;
};

function optionalString(v: unknown, field: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new PackError(`${field} must be text`);
  return v;
}

// Validate a decoded manifest.json. Completeness rules that depend on the rest
// of the zip (a complete pack needing system-prompt.md, name, voiceId) live in
// parsePack — this checks only the manifest's own fields.
export function parseManifest(raw: unknown): PackManifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PackError('manifest.json is not an object');
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.format !== 'number') throw new PackError('missing format');
  if (m.format > PACK_FORMAT) {
    throw new PackError('This pack needs a newer version of the app.');
  }
  if (m.format !== PACK_FORMAT) throw new PackError('unknown format');
  if (typeof m.id !== 'string' || !PACK_ID_RE.test(m.id)) {
    throw new PackError('id must be publisher.name (lowercase slugs)');
  }
  if (typeof m.version !== 'string' || m.version === '') {
    throw new PackError('missing version');
  }
  if (m.base !== undefined) {
    if (typeof m.base !== 'string' || !PACK_ID_RE.test(m.base)) {
      throw new PackError('base must be a companion id (publisher.name)');
    }
  }
  if (m.gender !== undefined && !GENDERS.has(m.gender as string)) {
    throw new PackError('unknown gender');
  }
  const accentColour = optionalString(m.accentColour, 'accentColour');
  if (accentColour !== undefined && !ACCENT_COLOURS.has(accentColour)) {
    throw new PackError(`unknown accentColour: ${accentColour}`);
  }
  if (m.contextWindow !== undefined && typeof m.contextWindow !== 'number') {
    throw new PackError('contextWindow must be a number');
  }
  if (
    m.passesReasoning !== undefined &&
    typeof m.passesReasoning !== 'boolean'
  ) {
    throw new PackError('passesReasoning must be true or false');
  }
  return {
    format: m.format,
    id: m.id,
    version: m.version,
    base: m.base as string | undefined,
    name: optionalString(m.name, 'name'),
    description: optionalString(m.description, 'description'),
    gender: m.gender as PackManifest['gender'],
    accentColour,
    voiceId: optionalString(m.voiceId, 'voiceId'),
    model: optionalString(m.model, 'model'),
    contextWindow: m.contextWindow as number | undefined,
    passesReasoning: m.passesReasoning as boolean | undefined,
  };
}
```

- [ ] **Step 5:** `npx jest src/lib/goonpacks/manifest.test.ts` → PASS.
      `npm run typecheck && npm run lint` clean.
- [ ] **Step 6: Commit** —
      `git add -A && git commit -m "goonpacks: manifest types and validation"`

---

### Task 2: Prompt placeholder fill

**Files:**

- Create: `src/lib/goonpacks/prompt.ts`, `src/lib/goonpacks/prompt.test.ts`

**Interfaces:**

- Consumes: the string exports of `src/lib/companions/shared-prompt.ts`
  (`OUTPUT_FORMAT_SECTION`, `SHARED_STYLE_BULLETS`, `CONTROL_SUMMARY_SECTION`,
  `PICTURES_SECTION`, `CONTROL_SECTION`).
- Produces:
  `export function fillSharedSections(prompt: string, opts: { includePictures: boolean }): string`

- [ ] **Step 1: Write failing tests** — `src/lib/goonpacks/prompt.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import {
  CONTROL_SECTION,
  OUTPUT_FORMAT_SECTION,
  PICTURES_SECTION,
} from '@/lib/companions/shared-prompt';
import { fillSharedSections } from './prompt';

describe('fillSharedSections', () => {
  it('substitutes shared sections by export name', () => {
    const out = fillSharedSections('a\n{{OUTPUT_FORMAT_SECTION}}\nb', {
      includePictures: false,
    });
    expect(out).toBe(`a\n${OUTPUT_FORMAT_SECTION}\nb`);
  });
  it('drops unknown tokens', () => {
    expect(
      fillSharedSections('a{{NOT_A_SECTION}}b', { includePictures: false }),
    ).toBe('ab');
  });
  it('leaves live markers untouched', () => {
    const text = 'x {{TOY_STATUS}} y {{NOW}} z';
    expect(fillSharedSections(text, { includePictures: false })).toBe(text);
  });
  it('fills PICTURES_SECTION only when pictures exist', () => {
    const text = '{{PICTURES_SECTION}}{{CONTROL_SECTION}}';
    expect(fillSharedSections(text, { includePictures: true })).toBe(
      `${PICTURES_SECTION}${CONTROL_SECTION}`,
    );
    expect(fillSharedSections(text, { includePictures: false })).toBe(
      CONTROL_SECTION,
    );
  });
});
```

- [ ] **Step 2:** `npx jest src/lib/goonpacks/prompt.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/lib/goonpacks/prompt.ts`:

```ts
// Load-time fill of {{PLACEHOLDER}} tokens in a persona prompt with the app's
// current shared sections, so the mechanical rules stay app-owned (spec:
// "System prompt placeholders"). Runtime markers are a different layer: they
// pass through here and are filled per-turn by the voice session.
import {
  CONTROL_SECTION,
  CONTROL_SUMMARY_SECTION,
  OUTPUT_FORMAT_SECTION,
  PICTURES_SECTION,
  SHARED_STYLE_BULLETS,
} from '@/lib/companions/shared-prompt';

// Placeholder name = shared-prompt export name, on purpose: adding an export
// there makes it addressable from a pack with no extra wiring.
const SECTIONS: Record<string, string> = {
  OUTPUT_FORMAT_SECTION,
  SHARED_STYLE_BULLETS,
  CONTROL_SUMMARY_SECTION,
  PICTURES_SECTION,
  CONTROL_SECTION,
};

// Filled per-turn by the session (buildSystemPrompt), not at load.
const LIVE_MARKERS = new Set(['TOY_STATUS', 'NOW']);

export function fillSharedSections(
  prompt: string,
  opts: { includePictures: boolean },
): string {
  return prompt.replace(/\{\{([A-Z0-9_]+)\}\}/g, (token, name: string) => {
    if (LIVE_MARKERS.has(name)) return token;
    if (name === 'PICTURES_SECTION' && !opts.includePictures) return '';
    return SECTIONS[name] ?? ''; // unknown tokens are dropped, per spec
  });
}
```

- [ ] **Step 4:** `npx jest src/lib/goonpacks/prompt.test.ts` → PASS.
      Typecheck/lint clean.
- [ ] **Step 5: Commit** —
      `git commit -am "goonpacks: shared-section placeholder fill"`

---

### Task 3: Zip parsing — `parsePack`

**Files:**

- Create: `src/lib/goonpacks/pack.ts`, `src/lib/goonpacks/pack.test.ts`

**Interfaces:**

- Consumes: `parseManifest`, `PackError`, `PackManifest` (Task 1); `fflate`'s
  `unzipSync`/`strFromU8`.
- Produces:

```ts
export type ParsedPicture = {
  name: string; // filename without extension
  description: string; // sidecar text, "" when absent
  bytes: Uint8Array;
  mimeType: string; // image/jpeg | image/png | image/webp
};
export type ParsedPack = {
  manifest: PackManifest;
  systemPrompt?: string; // raw text; placeholder fill happens at resolve
  pictures: ParsedPicture[];
};
export function parsePack(zipBytes: Uint8Array): ParsedPack; // throws PackError
```

- [ ] **Step 1: Write failing tests** — `src/lib/goonpacks/pack.test.ts` (build
      zips in-test with fflate):

```ts
import { describe, expect, it } from '@jest/globals';
import { strToU8, zipSync } from 'fflate';
import { PackError } from './manifest';
import { parsePack } from './pack';

const manifest = (extra: object = {}) =>
  strToU8(
    JSON.stringify({ format: 1, id: 'test.pack', version: '1.0.0', ...extra }),
  );
const complete = (extra: object = {}) =>
  manifest({ name: 'Testy', voiceId: 'v123', ...extra });

describe('parsePack', () => {
  it('parses a complete pack with pictures and sidecars', () => {
    const zip = zipSync({
      'manifest.json': complete(),
      'system-prompt.md': strToU8('You are Testy.'),
      'pictures/a.jpg': new Uint8Array([1, 2, 3]),
      'pictures/a.txt': strToU8('desc a'),
      'pictures/b.png': new Uint8Array([4]),
    });
    const pack = parsePack(zip);
    expect(pack.manifest.id).toBe('test.pack');
    expect(pack.systemPrompt).toBe('You are Testy.');
    expect(pack.pictures).toHaveLength(2);
    expect(pack.pictures[0]).toMatchObject({
      name: 'a',
      description: 'desc a',
      mimeType: 'image/jpeg',
    });
    expect(pack.pictures[1]).toMatchObject({ name: 'b', description: '' });
  });
  it('accepts an overlay with nothing but a manifest', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
    });
    expect(parsePack(zip).pictures).toEqual([]);
  });
  it('rejects a complete pack missing prompt/name/voiceId', () => {
    expect(() => parsePack(zipSync({ 'manifest.json': complete() }))).toThrow(
      /system-prompt/,
    );
    expect(() =>
      parsePack(
        zipSync({
          'manifest.json': manifest({ voiceId: 'v' }),
          'system-prompt.md': strToU8('x'),
        }),
      ),
    ).toThrow(PackError);
  });
  it('rejects a zip without a root manifest, hinting at folder-zips', () => {
    const zip = zipSync({ 'pack/manifest.json': complete() });
    expect(() => parsePack(zip)).toThrow(/root/);
  });
  it('rejects unsupported files under pictures/', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      'pictures/a.gif': new Uint8Array([1]),
    });
    expect(() => parsePack(zip)).toThrow(PackError);
  });
  it('ignores macOS zip junk', () => {
    const zip = zipSync({
      'manifest.json': manifest({ base: 'autogoon.aimee' }),
      '__MACOSX/._manifest.json': new Uint8Array([0]),
      '.DS_Store': new Uint8Array([0]),
      'pictures/.DS_Store': new Uint8Array([0]),
    });
    expect(parsePack(zip).pictures).toEqual([]);
  });
  it('rejects an unreadable zip', () => {
    expect(() => parsePack(new Uint8Array([9, 9, 9]))).toThrow(PackError);
  });
});
```

- [ ] **Step 2:** `npx jest src/lib/goonpacks/pack.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/lib/goonpacks/pack.ts`:

```ts
// Zip → ParsedPack. Pure and synchronous (packs are a few MB); used by the
// browser importer, the Jest tests, and nothing else — the authoring build
// script has its own Node-side zip writer.
import { strFromU8, unzipSync } from 'fflate';
import { PackError, parseManifest, type PackManifest } from './manifest';

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type ParsedPicture = {
  name: string;
  description: string;
  bytes: Uint8Array;
  mimeType: string;
};

export type ParsedPack = {
  manifest: PackManifest;
  systemPrompt?: string;
  pictures: ParsedPicture[];
};

// Zip housekeeping entries that hand-made (Finder) zips accumulate.
function isJunk(path: string): boolean {
  return (
    path.startsWith('__MACOSX/') ||
    path.endsWith('/') ||
    path.split('/').pop() === '.DS_Store'
  );
}

export function parsePack(zipBytes: Uint8Array): ParsedPack {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new PackError('not a readable zip');
  }
  const files = Object.entries(entries).filter(([path]) => !isJunk(path));

  const manifestEntry = files.find(([path]) => path === 'manifest.json');
  if (!manifestEntry) {
    throw new PackError(
      "no manifest.json at the zip root — zip the pack folder's contents, not the folder",
    );
  }
  let manifest: PackManifest;
  try {
    manifest = parseManifest(JSON.parse(strFromU8(manifestEntry[1])));
  } catch (e) {
    if (e instanceof PackError) throw e;
    throw new PackError('manifest.json is not valid JSON');
  }

  const promptEntry = files.find(([path]) => path === 'system-prompt.md');
  const systemPrompt = promptEntry ? strFromU8(promptEntry[1]) : undefined;

  const pictures: ParsedPicture[] = [];
  const sidecars = new Map<string, string>();
  for (const [path, bytes] of files) {
    if (!path.startsWith('pictures/')) continue;
    const file = path.slice('pictures/'.length);
    if (file.includes('/')) throw new PackError(`nested folder: ${path}`);
    const dot = file.lastIndexOf('.');
    const stem = dot === -1 ? file : file.slice(0, dot);
    const ext = dot === -1 ? '' : file.slice(dot + 1).toLowerCase();
    if (ext === 'txt') {
      sidecars.set(stem, strFromU8(bytes).trim());
    } else if (IMAGE_TYPES[ext]) {
      pictures.push({
        name: stem,
        description: '',
        bytes,
        mimeType: IMAGE_TYPES[ext],
      });
    } else {
      throw new PackError(`unsupported file in pictures/: ${file}`);
    }
  }
  for (const p of pictures) p.description = sidecars.get(p.name) ?? '';
  pictures.sort((a, b) => a.name.localeCompare(b.name));

  if (manifest.base === undefined) {
    if (systemPrompt === undefined) {
      throw new PackError('a complete pack needs system-prompt.md');
    }
    if (!manifest.name) throw new PackError('a complete pack needs a name');
    if (!manifest.voiceId) {
      throw new PackError('a complete pack needs a voiceId');
    }
  }
  return { manifest, systemPrompt, pictures };
}
```

- [ ] **Step 4:** `npx jest src/lib/goonpacks/pack.test.ts` → PASS.
      Typecheck/lint clean.
- [ ] **Step 5: Commit** —
      `git commit -am "goonpacks: zip parsing and pack validation"`

---

### Task 4: Storage — IndexedDB cache + self-healing index

**Files:**

- Create: `src/lib/goonpacks/store.ts`, `src/lib/goonpacks/store.test.ts`

**Interfaces:**

- Consumes: `PackManifest` (Task 1).
- Produces:

```ts
export type IndexEntry = {
  id: string;
  version: string;
  name?: string;
  base?: string;
};
export function toIndexEntry(m: PackManifest): IndexEntry;
export function reconcile(
  index: IndexEntry[],
  stored: IndexEntry[],
): { healed: IndexEntry[]; missing: IndexEntry[] };
export function readIndex(storage: Storage): IndexEntry[];
export function writeIndex(storage: Storage, entries: IndexEntry[]): void;
// Browser-only (IndexedDB); no unit tests — kept thin:
export async function listStoredManifests(): Promise<PackManifest[]>;
export async function putPack(manifest: PackManifest, zip: Blob): Promise<void>;
export async function deletePack(id: string): Promise<void>;
export async function getPackZip(id: string): Promise<Blob | null>;
```

`reconcile` is the eviction-survival core (spec: "Eviction can be partial"):
`healed` = every stored record's entry, plus index entries whose record is gone;
`missing` = exactly those record-less entries. Unreadable records are filtered
out by `listStoredManifests` before reconcile, so they count as missing.

- [ ] **Step 1: Write failing tests** — `src/lib/goonpacks/store.test.ts` (pure
      parts only):

```ts
import { describe, expect, it } from '@jest/globals';
import { readIndex, reconcile, toIndexEntry, writeIndex } from './store';

const entry = (id: string, extra: object = {}) => ({
  id,
  version: '1.0.0',
  ...extra,
});

describe('reconcile', () => {
  it('flags index entries with no stored record as missing', () => {
    const { healed, missing } = reconcile(
      [entry('a.b'), entry('c.d')],
      [entry('a.b')],
    );
    expect(missing).toEqual([entry('c.d')]);
    expect(healed).toHaveLength(2);
  });
  it('heals records the index forgot', () => {
    const { healed, missing } = reconcile([], [entry('a.b')]);
    expect(missing).toEqual([]);
    expect(healed).toEqual([entry('a.b')]);
  });
  it("prefers the stored record's data over a stale index entry", () => {
    const { healed } = reconcile(
      [entry('a.b', { version: '0.9' })],
      [entry('a.b')],
    );
    expect(healed).toEqual([entry('a.b')]);
  });
});

describe('index round-trip', () => {
  // Minimal Storage stand-in — only what read/writeIndex touch.
  const fake = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    } as Storage;
  };
  it('round-trips entries', () => {
    const s = fake();
    writeIndex(s, [entry('a.b')]);
    expect(readIndex(s)).toEqual([entry('a.b')]);
  });
  it('treats garbage as empty', () => {
    const s = fake();
    s.setItem('goonpacks:index', '{nope');
    expect(readIndex(s)).toEqual([]);
  });
  it('derives an entry from a manifest', () => {
    expect(
      toIndexEntry({
        format: 1,
        id: 'a.b',
        version: '2',
        name: 'B',
        base: 'c.d',
      }),
    ).toEqual({ id: 'a.b', version: '2', name: 'B', base: 'c.d' });
  });
});
```

- [ ] **Step 2:** `npx jest src/lib/goonpacks/store.test.ts` → FAIL.
- [ ] **Step 3: Implement** `src/lib/goonpacks/store.ts`:

```ts
// Pack storage. IndexedDB is a CACHE keyed by pack id ({manifest, zip blob});
// the user's zip files are the store of record. localStorage carries a small
// derived index so startup can tell "evicted" from "never imported" — spec:
// "Eviction can be partial — never assume all-or-nothing."
import type { PackManifest } from './manifest';
import { parseManifest } from './manifest';

export type IndexEntry = {
  id: string;
  version: string;
  name?: string;
  base?: string;
};

const INDEX_KEY = 'goonpacks:index';

export function toIndexEntry(m: PackManifest): IndexEntry {
  const e: IndexEntry = { id: m.id, version: m.version };
  if (m.name !== undefined) e.name = m.name;
  if (m.base !== undefined) e.base = m.base;
  return e;
}

export function readIndex(storage: Storage): IndexEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(INDEX_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is IndexEntry =>
        typeof e === 'object' && e !== null && typeof e.id === 'string',
    );
  } catch {
    return [];
  }
}

export function writeIndex(storage: Storage, entries: IndexEntry[]): void {
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Quota/unavailable: the index is derived state; losing it only costs
    // "evicted vs never imported" hints, never data.
  }
}

// Stored records win over stale index entries; index entries with no record
// are the evicted ones the UI shows as awaiting re-import.
export function reconcile(
  index: IndexEntry[],
  stored: IndexEntry[],
): { healed: IndexEntry[]; missing: IndexEntry[] } {
  const storedById = new Map(stored.map((e) => [e.id, e]));
  const missing = index.filter((e) => !storedById.has(e.id));
  const healedIds = new Set<string>();
  const healed: IndexEntry[] = [];
  for (const e of [...stored, ...missing]) {
    if (healedIds.has(e.id)) continue;
    healedIds.add(e.id);
    healed.push(e);
  }
  return { healed, missing };
}

// --- IndexedDB (browser only, kept too thin to unit-test) ---

const DB_NAME = 'autogoon-goonpacks';
const STORE = 'packs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexeddb failed'));
        t.oncomplete = () => db.close();
      }),
  );
}

type StoredRecord = { manifest: unknown; zip: Blob };

// Every readable, valid record's manifest. Unreadable/invalid records are
// skipped — they count as evicted and surface via reconcile as missing.
export async function listStoredManifests(): Promise<PackManifest[]> {
  let records: unknown[];
  try {
    records = await tx('readonly', (s) => s.getAll());
  } catch {
    return [];
  }
  const out: PackManifest[] = [];
  for (const r of records) {
    try {
      out.push(parseManifest((r as StoredRecord).manifest));
    } catch {
      // skip — treated as evicted
    }
  }
  return out;
}

export async function putPack(
  manifest: PackManifest,
  zip: Blob,
): Promise<void> {
  await tx('readwrite', (s) => s.put({ manifest, zip }, manifest.id));
}

export async function deletePack(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function getPackZip(id: string): Promise<Blob | null> {
  try {
    const r = (await tx('readonly', (s) => s.get(id))) as
      StoredRecord | undefined;
    return r?.zip ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4:** `npx jest src/lib/goonpacks/store.test.ts` → PASS.
      Typecheck/lint clean (note: `IDBDatabase` etc. come from TS DOM lib — no
      imports needed).
- [ ] **Step 5: Commit** —
      `git commit -am "goonpacks: IndexedDB cache with self-healing index"`

---

### Task 5: Stock ids → `autogoon.*`, defaults, thread migration, prompt tokens

**Files:**

- Modify: `src/lib/companions/companions.ts`,
  `src/lib/companions/elise-prompt.ts`, `src/lib/companions/aimee-prompt.ts`,
  `src/lib/companions/miley-prompt.ts`
- Create: `src/lib/goonpacks/migrate.ts`, `src/lib/goonpacks/migrate.test.ts`

**Interfaces (produces):**

- `CompanionId` becomes `string`; `COMPANIONS: Record<string, Companion>` keyed
  `autogoon.elise|aimee|miley` (each entry's `id` matches its key).
- `export const DEFAULT_MODEL = "minimax/minimax-m3"`,
  `DEFAULT_CONTEXT_WINDOW = 1_000_000`, `DEFAULT_PASSES_REASONING = true`
  exported from `companions.ts` (the "app defaults" the spec's optional manifest
  fields fall back to).
- `export function migrateThreadKeys(storage: Storage): void` from `migrate.ts`.

- [ ] **Step 1: Write failing migration tests** —
      `src/lib/goonpacks/migrate.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { migrateThreadKeys } from './migrate';

function fakeStorage(seed: Record<string, string>) {
  const m = new Map(Object.entries(seed));
  return {
    storage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as Storage,
    map: m,
  };
}

describe('migrateThreadKeys', () => {
  it('renames legacy thread keys to autogoon ids', () => {
    const { storage, map } = fakeStorage({
      'companions:thread:elise': '[thread]',
    });
    migrateThreadKeys(storage);
    expect(map.get('companions:thread:autogoon.elise')).toBe('[thread]');
    expect(map.has('companions:thread:elise')).toBe(false);
  });
  it('never overwrites an existing new-key thread', () => {
    const { storage, map } = fakeStorage({
      'companions:thread:miley': 'old',
      'companions:thread:autogoon.miley': 'new',
    });
    migrateThreadKeys(storage);
    expect(map.get('companions:thread:autogoon.miley')).toBe('new');
  });
  it('is a no-op with nothing to migrate', () => {
    const { storage, map } = fakeStorage({ other: 'x' });
    migrateThreadKeys(storage);
    expect(map.size).toBe(1);
  });
});
```

- [ ] **Step 2:** Run it → FAIL. Implement `src/lib/goonpacks/migrate.ts`:

```ts
// One-time localStorage migration: stock companions moved from bare ids to
// autogoon.* when goonpacks landed; carry their saved threads across.
// Idempotent — safe to run on every startup.
const LEGACY_IDS = ['elise', 'aimee', 'miley'];

export function migrateThreadKeys(storage: Storage): void {
  for (const legacy of LEGACY_IDS) {
    const oldKey = `companions:thread:${legacy}`;
    const newKey = `companions:thread:autogoon.${legacy}`;
    const value = storage.getItem(oldKey);
    if (value === null) continue;
    if (storage.getItem(newKey) === null) storage.setItem(newKey, value);
    storage.removeItem(oldKey);
  }
}
```

- [ ] **Step 3:** `npx jest src/lib/goonpacks/migrate.test.ts` → PASS.
- [ ] **Step 4: Rename ids + add defaults** in
      `src/lib/companions/companions.ts`: change `CompanionId` to
      `export type CompanionId = string;` (keep the comment explaining ids are
      `publisher.name`); change the three keys and `id` fields to
      `autogoon.elise` / `autogoon.aimee` / `autogoon.miley`; type the record
      `Record<string, Companion>`; add above `COMPANIONS`:

```ts
// App defaults a pack manifest may omit (spec: model/contextWindow/
// passesReasoning "default to the app's current defaults").
export const DEFAULT_MODEL = 'minimax/minimax-m3';
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;
export const DEFAULT_PASSES_REASONING = true;
```

Use the constants in the three entries (`model: DEFAULT_MODEL,` etc.).
`COMPANION_PICTURES.aimee` / `.miley` references are unchanged (generated keys
come from directory names, which haven't moved yet).

- [ ] **Step 5: Prompt tokens.** In `aimee-prompt.ts` and `miley-prompt.ts`:
      remove `PICTURES_SECTION` from the `shared-prompt` import and replace the
      interpolation line `${PICTURES_SECTION}` with the literal line
      `{{PICTURES_SECTION}}`. In `elise-prompt.ts`: add a `{{PICTURES_SECTION}}`
      line directly above the `${CONTROL_SECTION}` line (Elise ships
      pictureless; the token collapses to nothing until an overlay adds
      pictures). These tokens are filled by `resolveDefault`/`applyOverlay`
      (Task 6) — until Task 7 wires that in, built-in prompts briefly carry the
      literal token; that's fine mid-branch.
- [ ] **Step 6:** Fix the fallout `npm run typecheck` reveals:
      `companions-panel.tsx`'s `useState<CompanionId>(companionList[0]!.id)` and
      `COMPANIONS[companionId]` still typecheck (`CompanionId` = string; add `!`
      if the record index now returns `Companion | undefined` — make it
      `const companion = COMPANIONS[companionId]!;`). Run `npm test` (existing
      suites must stay green), `npm run typecheck`, `npm run lint`.
- [ ] **Step 7: Commit** —
      `git commit -am "goonpacks: autogoon.* stock ids, app defaults, thread-key migration"`

---

### Task 6: Overlay resolution

**Files:**

- Create: `src/lib/goonpacks/resolve.ts`, `src/lib/goonpacks/resolve.test.ts`

**Interfaces:**

- Consumes: `Companion`, `CompanionPicture`, `DEFAULT_MODEL`,
  `DEFAULT_CONTEXT_WINDOW`, `DEFAULT_PASSES_REASONING` (companions.ts);
  `PackManifest` (Task 1); `fillSharedSections` (Task 2).
- Produces:

```ts
export type PackContent = {
  manifest: PackManifest;
  systemPrompt?: string;
  pictures: CompanionPicture[]; // src already object-URLs (hook's job)
};
export function resolveDefault(base: Companion): Companion;
export function packToCompanion(pack: PackContent): Companion; // complete packs
export function applyOverlay(base: Companion, overlay: PackContent): Companion;
```

All three run `fillSharedSections` on the final prompt with
`includePictures = resolved pictures.length > 0`. `applyOverlay` keeps `base.id`
(thread ownership); present overlay fields replace the base's; overlay pictures
(when the zip had a `pictures/` dir) replace the base's set.

- [ ] **Step 1: Write failing tests** — `src/lib/goonpacks/resolve.test.ts`:

```ts
import { describe, expect, it } from '@jest/globals';
import { PICTURES_SECTION } from '@/lib/companions/shared-prompt';
import type { Companion } from '@/lib/companions/companions';
import { applyOverlay, packToCompanion, resolveDefault } from './resolve';

const base: Companion = {
  id: 'autogoon.aimee',
  name: 'Aimee',
  description: 'sweet',
  gender: 'female',
  accent_colour: 'emerald',
  voiceId: 'v-base',
  systemPrompt: 'hi\n{{PICTURES_SECTION}}',
  model: 'm',
  contextWindow: 10,
  passesReasoning: true,
};
const overlay = (
  extra: object = {},
  pictures = [] as Companion['pictures'],
) => ({
  manifest: {
    format: 1,
    id: 'g00ner.aimee',
    version: '1.0.0',
    base: 'autogoon.aimee',
    ...extra,
  },
  pictures: pictures ?? [],
});

describe('applyOverlay', () => {
  it('keeps the base id and fields the overlay omits', () => {
    const out = applyOverlay(base, overlay());
    expect(out.id).toBe('autogoon.aimee');
    expect(out.voiceId).toBe('v-base');
  });
  it('replaces fields the overlay provides', () => {
    const out = applyOverlay(base, {
      ...overlay({ voiceId: 'v-new', name: 'Amy' }),
      systemPrompt: 'yo {{NOT_A_SECTION}}',
    });
    expect(out.voiceId).toBe('v-new');
    expect(out.name).toBe('Amy');
    expect(out.systemPrompt).toBe('yo ');
  });
  it('fills PICTURES_SECTION when the overlay brings pictures', () => {
    const pics = [{ src: 'blob:x', description: 'd' }];
    expect(applyOverlay(base, overlay({}, pics)).systemPrompt).toBe(
      `hi\n${PICTURES_SECTION}`,
    );
    expect(applyOverlay(base, overlay()).systemPrompt).toBe('hi\n');
  });
});

describe('packToCompanion', () => {
  it('builds a companion with app defaults for omitted fields', () => {
    const c = packToCompanion({
      manifest: {
        format: 1,
        id: 'some.one',
        version: '1',
        name: 'One',
        voiceId: 'v1',
      },
      systemPrompt: 'p',
      pictures: [],
    });
    expect(c.id).toBe('some.one');
    expect(c.model).toBe('minimax/minimax-m3');
    expect(c.contextWindow).toBe(1_000_000);
    expect(c.passesReasoning).toBe(true);
    expect(c.gender).toBe('female');
    expect(c.accent_colour).toBe('pink');
  });
});

describe('resolveDefault', () => {
  it("fills the built-in's tokens (pictureless → section dropped)", () => {
    expect(resolveDefault(base).systemPrompt).toBe('hi\n');
  });
});
```

- [ ] **Step 2:** Run → FAIL. Implement `src/lib/goonpacks/resolve.ts`:

```ts
// Turns pack content into a playable Companion. The load-time half of the
// prompt pipeline: shared-section tokens are filled here, live markers stay
// for the session's per-turn fill. An overlay keeps the BASE's id — the id is
// thread ownership, and an overlay is "my version of her", not a new her.
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MODEL,
  DEFAULT_PASSES_REASONING,
  type Companion,
  type CompanionPicture,
} from '@/lib/companions/companions';
import type { PackManifest } from './manifest';
import { fillSharedSections } from './prompt';

export type PackContent = {
  manifest: PackManifest;
  systemPrompt?: string;
  pictures: CompanionPicture[];
};

function fill(prompt: string, pictures: CompanionPicture[] | undefined) {
  return fillSharedSections(prompt, {
    includePictures: (pictures?.length ?? 0) > 0,
  });
}

// A built-in (or complete pack) played as-is — "default" in the variant list.
export function resolveDefault(base: Companion): Companion {
  return { ...base, systemPrompt: fill(base.systemPrompt, base.pictures) };
}

export function packToCompanion(pack: PackContent): Companion {
  const m = pack.manifest;
  const pictures = pack.pictures.length > 0 ? pack.pictures : undefined;
  return {
    id: m.id,
    name: m.name ?? m.id,
    description: m.description ?? '',
    gender: m.gender ?? 'female',
    accent_colour: m.accentColour ?? 'pink',
    voiceId: m.voiceId ?? '',
    systemPrompt: fill(pack.systemPrompt ?? '', pictures),
    model: m.model ?? DEFAULT_MODEL,
    contextWindow: m.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    passesReasoning: m.passesReasoning ?? DEFAULT_PASSES_REASONING,
    pictures,
  };
}

export function applyOverlay(base: Companion, overlay: PackContent): Companion {
  const m = overlay.manifest;
  const pictures =
    overlay.pictures.length > 0 ? overlay.pictures : base.pictures;
  const rawPrompt = overlay.systemPrompt ?? base.systemPrompt;
  return {
    ...base, // id stays the base's — thread ownership
    name: m.name ?? base.name,
    description: m.description ?? base.description,
    gender: m.gender ?? base.gender,
    accent_colour: m.accentColour ?? base.accent_colour,
    voiceId: m.voiceId ?? base.voiceId,
    model: m.model ?? base.model,
    contextWindow: m.contextWindow ?? base.contextWindow,
    passesReasoning: m.passesReasoning ?? base.passesReasoning,
    pictures,
    systemPrompt: fill(rawPrompt, pictures),
  };
}
```

Note: `resolveDefault` on a built-in must run on the RAW prompt exactly once —
the hook (Task 7) is the only caller; it never double-fills (filling is
idempotent for known tokens anyway, since section text contains no `{{…}}`).

- [ ] **Step 3:** `npx jest src/lib/goonpacks/resolve.test.ts` → PASS. Full
      `npm test` green. Typecheck/lint clean.
- [ ] **Step 4: Commit** —
      `git commit -am "goonpacks: overlay resolution and pack-to-companion"`

---

### Task 7: Library hook

**Files:**

- Create: `src/hooks/use-goonpack-library.ts`
- Test: covered by typecheck + the e2e (Task 10); the pure logic it composes is
  already unit-tested.

**Interfaces:**

- Consumes: everything from Tasks 1–6; `COMPANIONS`, `companionList`
  (companions.ts).
- Produces:

```ts
export type Variant = {
  packId: string | null; // null = default
  label: string; // "default" | overlay publisher ("g00ner")
  version?: string;
  missing: boolean; // overlay record evicted — shown, not playable
};
export type LibraryEntry = {
  companion: Companion; // UNRESOLVED base (raw prompt); display fields only
  builtIn: boolean;
  missing: boolean; // complete pack evicted — re-import placeholder card
  variants: Variant[]; // default first, overlays sorted by id
};
export function useGoonpackLibrary(): {
  entries: LibraryEntry[];
  lastPlayed: (companionId: string) => string | null; // packId | "default"
  importPack(file: File): Promise<PendingImport>; // parse + stage; throws PackError
  removePack(id: string): Promise<void>; // cascades overlays (user action)
  resolveVariant(
    entry: LibraryEntry,
    packId: string | null,
  ): Promise<Companion>;
};
export type PendingImport = {
  manifest: PackManifest;
  replaces: IndexEntry | null; // same-id → confirm shows both versions
  commit(): Promise<void>; // store + refresh
};
```

- [ ] **Step 1: Implement** `src/hooks/use-goonpack-library.ts`:

```ts
'use client';
// The chooser's library: built-ins + imported packs, reconciled against
// partial eviction on every load. All pack knowledge for the panel flows
// through here; the panel never touches the store directly.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COMPANIONS,
  companionList,
  type Companion,
} from '@/lib/companions/companions';
import { PackError, type PackManifest } from '@/lib/goonpacks/manifest';
import { parsePack } from '@/lib/goonpacks/pack';
import {
  applyOverlay,
  packToCompanion,
  resolveDefault,
  type PackContent,
} from '@/lib/goonpacks/resolve';
import {
  deletePack,
  getPackZip,
  listStoredManifests,
  putPack,
  readIndex,
  reconcile,
  toIndexEntry,
  writeIndex,
  type IndexEntry,
} from '@/lib/goonpacks/store';
import { migrateThreadKeys } from '@/lib/goonpacks/migrate';

export type Variant = {
  packId: string | null;
  label: string;
  version?: string;
  missing: boolean;
};
export type LibraryEntry = {
  companion: Companion;
  builtIn: boolean;
  missing: boolean;
  variants: Variant[];
};
export type PendingImport = {
  manifest: PackManifest;
  replaces: IndexEntry | null;
  commit(): Promise<void>;
};

const LAST_PLAYED_PREFIX = 'goonpacks:last-variant:'; // cosmetic marker

const publisher = (id: string) => id.split('.')[0]!;

// Library state assembled from whatever survived storage: manifests for live
// records, index entries standing in for evicted ones.
function buildEntries(
  manifests: PackManifest[],
  missing: IndexEntry[],
): LibraryEntry[] {
  const overlayFor = (companionId: string): Variant[] => [
    { packId: null, label: 'default', missing: false },
    ...manifests
      .filter((m) => m.base === companionId)
      .map((m) => ({
        packId: m.id,
        label: publisher(m.id),
        version: m.version,
        missing: false,
      })),
    ...missing
      .filter((e) => e.base === companionId)
      .map((e) => ({
        packId: e.id,
        label: publisher(e.id),
        version: e.version,
        missing: true,
      })),
  ];
  const builtIns: LibraryEntry[] = companionList.map((c) => ({
    companion: c,
    builtIn: true,
    missing: false,
    variants: overlayFor(c.id),
  }));
  const completes: LibraryEntry[] = manifests
    .filter((m) => m.base === undefined)
    .map((m) => ({
      companion: packToCompanion({ manifest: m, pictures: [] }),
      builtIn: false,
      missing: false,
      variants: overlayFor(m.id),
    }));
  const evicted: LibraryEntry[] = missing
    .filter((e) => e.base === undefined)
    .map((e) => ({
      companion: {
        ...packToCompanion({
          manifest: { format: 1, id: e.id, version: e.version, name: e.name },
          pictures: [],
        }),
      },
      builtIn: false,
      missing: true,
      variants: overlayFor(e.id),
    }));
  return [...builtIns, ...completes, ...evicted];
}

// Unzip a stored pack. Missing/unreadable → PackError (the card's re-import
// path); pictures become object URLs, revoked by the caller when replaced.
async function loadContent(packId: string): Promise<PackContent> {
  const zip = await getPackZip(packId);
  if (zip === null) throw new PackError('pack missing — re-import its zip');
  const parsed = parsePack(new Uint8Array(await zip.arrayBuffer()));
  return {
    manifest: parsed.manifest,
    systemPrompt: parsed.systemPrompt,
    pictures: parsed.pictures.map((p) => ({
      src: URL.createObjectURL(
        new Blob([p.bytes.buffer as ArrayBuffer], { type: p.mimeType }),
      ),
      description: p.description,
      // Stable thread reference: object URLs die with the session, so the
      // thread persists this ref and rendering resolves it (see spec Threads).
      ref: `goonpack:${packId}/${p.name}`,
    })),
  };
}
```

Requires `CompanionPicture` in `companions.ts` to gain an optional field:

```ts
  ref?: string; // stable thread ref (goonpack:<packId>/<name>); packs only
```

And `resolve.ts` gains a pure resolver (append to resolve.test.ts: hit → src,
same name different pack → null, legacy path ref → the path itself):

```ts
// A thread's persisted picture ref → a renderable src, or null when the
// referenced pack picture isn't in the loaded set (render a placeholder —
// never a substitute picture).
export function resolvePictureRef(
  ref: string,
  pictures: CompanionPicture[] | undefined,
): string | null {
  if (!ref.startsWith('goonpack:')) return ref; // legacy path-style imageSrc
  return pictures?.find((p) => p.ref === ref)?.src ?? null;
}

export function useGoonpackLibrary() {
  const [entries, setEntries] = useState<LibraryEntry[]>(() =>
    buildEntries([], []),
  );
  // Object URLs from the previous resolve — revoked when a new pick replaces
  // them (a session holds at most one variant's pictures).
  const urlsRef = useRef<string[]>([]);

  const refresh = useCallback(async () => {
    const manifests = await listStoredManifests();
    const { healed, missing } = reconcile(
      readIndex(localStorage),
      manifests.map(toIndexEntry),
    );
    writeIndex(localStorage, healed);
    setEntries(buildEntries(manifests, missing));
  }, []);

  useEffect(() => {
    migrateThreadKeys(localStorage);
    void refresh();
  }, [refresh]);

  const importPack = useCallback(
    async (file: File): Promise<PendingImport> => {
      const parsed = parsePack(new Uint8Array(await file.arrayBuffer()));
      const m = parsed.manifest;
      if (m.base !== undefined) {
        const baseExists =
          COMPANIONS[m.base] !== undefined ||
          readIndex(localStorage).some((e) => e.id === m.base);
        if (!baseExists) {
          throw new PackError(`needs its base installed first: ${m.base}`);
        }
      }
      const replaces =
        readIndex(localStorage).find((e) => e.id === m.id) ?? null;
      return {
        manifest: m,
        replaces,
        commit: async () => {
          await putPack(m, file);
          writeIndex(localStorage, [
            ...readIndex(localStorage).filter((e) => e.id !== m.id),
            toIndexEntry(m),
          ]);
          await refresh();
        },
      };
    },
    [refresh],
  );

  const removePack = useCallback(
    async (id: string) => {
      // User-initiated removal cascades to the pack's overlays (never on
      // eviction). Threads are untouched — re-import brings her back whole.
      const index = readIndex(localStorage);
      const doomed = [
        id,
        ...index.filter((e) => e.base === id).map((e) => e.id),
      ];
      for (const d of doomed) await deletePack(d);
      writeIndex(
        localStorage,
        index.filter((e) => !doomed.includes(e.id)),
      );
      await refresh();
    },
    [refresh],
  );

  const resolveVariant = useCallback(
    async (entry: LibraryEntry, packId: string | null): Promise<Companion> => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
      let companion: Companion;
      if (packId === null) {
        companion = entry.builtIn
          ? resolveDefault(entry.companion)
          : packToCompanion(await loadContent(entry.companion.id));
      } else {
        const base = entry.builtIn
          ? entry.companion
          : packToCompanion(await loadContent(entry.companion.id));
        companion = applyOverlay(base, await loadContent(packId));
      }
      urlsRef.current = (companion.pictures ?? []).map((p) => p.src);
      localStorage.setItem(
        LAST_PLAYED_PREFIX + entry.companion.id,
        packId ?? 'default',
      );
      return companion;
    },
    [],
  );

  const lastPlayed = useCallback(
    (companionId: string) =>
      localStorage.getItem(LAST_PLAYED_PREFIX + companionId),
    [],
  );

  return { entries, lastPlayed, importPack, removePack, resolveVariant };
}
```

- [ ] **Step 2:** `npm run typecheck && npm run lint` → clean. (Behaviour is
      exercised in Tasks 8/10.)
- [ ] **Step 3: Commit** —
      `git commit -am "goonpacks: library hook (import, remove, variants, eviction reconcile)"`

---

### Task 8: Chooser UI

**Files:**

- Modify: `src/components/play-modes/companions-panel.tsx`

**Interfaces:**

- Consumes: `useGoonpackLibrary` (Task 7), `resolveDefault` (Task 6),
  `PackError`.
- Produces: setup view = library cards with variant rows, Import pack button +
  confirm sheet, remove affordance, re-import placeholders, storage caveat line.

- [ ] **Step 1: Companion state.** Replace the `companionId` state +
      `COMPANIONS` lookup (`companions-panel.tsx:360-363`) with a
      resolved-companion state (the session consumes a full `Companion`, so
      nothing downstream changes):

```tsx
const library = useGoonpackLibrary();
// The picked, fully-resolved companion (variant applied, prompt sections
// filled). Starts on the first built-in's default variant.
const [companion, setCompanion] = useState<Companion>(() =>
  resolveDefault(companionList[0]!),
);
```

Remove the now-unused `CompanionId`/`COMPANIONS` imports if nothing else in the
file uses them.

- [ ] **Step 2: Setup view.** Replace the `companionList.map` block
      (`companions-panel.tsx:777-801`) with library entries. Keep the existing
      card markup verbatim for the main button; add the variant row, remove, and
      placeholder states around it:

```tsx
{
  library.entries.map((entry) => {
    const c = entry.companion;
    const accent = c.accent_colour;
    const overlays = entry.variants.filter((v) => v.packId !== null);
    const pick = (packId: string | null) => {
      void (async () => {
        try {
          const resolved = await library.resolveVariant(entry, packId);
          if (resolved === null) return; // overtaken by a newer pick
          setCompanion(resolved);
          enterPlay();
        } catch (e) {
          setImportError(
            e instanceof PackError ? e.message : 'pack failed to load',
          );
        }
      })();
    };
    if (entry.missing) {
      // Evicted complete pack: browser storage let it go; the zip has it.
      return (
        <div key={c.id} className="rounded-xl border border-dashed px-4 py-3">
          <span className="block font-semibold">{c.name}</span>
          <span className="text-muted-foreground block text-sm">
            Gone from browser storage. Re-import her zip.
          </span>
        </div>
      );
    }
    return (
      <div key={c.id} className="flex flex-col gap-1">
        <Button
          onClick={() => pick(null)}
          className={`flex items-center gap-4 rounded-xl border border-${accent}-500 bg-linear-to-br from-${accent}-500/15 to-${accent}-500/5 px-4 py-3 text-left hover:from-${accent}-500/25 hover:to-${accent}-500/10`}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{c.name}</span>
            <span className="text-muted-foreground block text-sm">
              {c.description}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </Button>
        {overlays.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2">
            {entry.variants.map((v) =>
              v.missing ? (
                <span
                  key={v.packId}
                  className="text-muted-foreground rounded border border-dashed px-2 py-0.5 text-xs"
                >
                  {v.label} — re-import
                </span>
              ) : (
                <Button
                  key={v.packId ?? 'default'}
                  onClick={() => pick(v.packId)}
                  className="text-muted-foreground hover:text-foreground rounded border px-2 py-0.5 text-xs"
                >
                  {v.label}
                  {v.version !== undefined ? ` ${v.version}` : ''}
                  {library.lastPlayed(c.id) === (v.packId ?? 'default')
                    ? ' •'
                    : ''}
                </Button>
              ),
            )}
          </div>
        )}
        {!entry.builtIn && (
          <Button
            onClick={() => void library.removePack(c.id)}
            className="text-muted-foreground hover:text-foreground self-start px-2 text-xs"
          >
            Remove{overlays.length > 0 ? ' (and her overlays)' : ''}
          </Button>
        )}
      </div>
    );
  });
}
```

- [ ] **Step 3: Import affordance + confirm sheet.** Panel state and handlers
      (near the other setup-view state):

```tsx
const fileRef = useRef<HTMLInputElement>(null);
const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
const [importError, setImportError] = useState<string | null>(null);
const onPickFile = useCallback(
  (file: File) => {
    setImportError(null);
    void library
      .importPack(file)
      .then(setPendingImport)
      .catch((e: unknown) =>
        setImportError(e instanceof PackError ? e.message : 'import failed'),
      );
  },
  [library],
);
```

Below the card list in the setup view:

```tsx
<input
  ref={fileRef}
  type="file"
  accept=".zip"
  className="hidden"
  data-testid="goonpack-file-input"
  onChange={(e) => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
    e.target.value = "";
  }}
/>
<Button
  onClick={() => fileRef.current?.click()}
  className="text-muted-foreground hover:text-foreground mt-2 rounded-xl border border-dashed px-4 py-2 text-sm"
>
  Import pack
</Button>
{importError !== null && (
  <p className="mt-1 text-sm text-red-500">{importError}</p>
)}
{pendingImport !== null && (
  <div className="mt-2 rounded-xl border px-4 py-3 text-sm">
    <p className="font-semibold">
      {pendingImport.manifest.name ?? pendingImport.manifest.id}
      <span className="text-muted-foreground font-normal">
        {" "}
        {pendingImport.manifest.id} · v{pendingImport.manifest.version}
        {pendingImport.manifest.base !== undefined
          ? ` · overlays ${pendingImport.manifest.base}`
          : ""}
      </span>
    </p>
    {pendingImport.manifest.description !== undefined && (
      <p className="text-muted-foreground">
        {pendingImport.manifest.description}
      </p>
    )}
    {pendingImport.replaces !== null && (
      <p className="mt-1">
        Replaces v{pendingImport.replaces.version}. Threads stay.
      </p>
    )}
    <div className="mt-2 flex gap-2">
      <Button
        onClick={() =>
          void pendingImport.commit().then(() => setPendingImport(null))
        }
        className="rounded border px-3 py-1"
      >
        {pendingImport.replaces !== null ? "Replace" : "Import"}
      </Button>
      <Button
        onClick={() => setPendingImport(null)}
        className="text-muted-foreground rounded px-3 py-1"
      >
        Cancel
      </Button>
    </div>
  </div>
)}
<p className="text-muted-foreground mt-2 text-xs">
  Packs live in browser storage; keep your zips.
</p>
```

- [ ] **Step 3b: Stable picture refs in the transcript.** The `send_picture`
      tool's `run` currently returns `imageSrc: pic.src`; change it to persist
      the stable ref (`imageSrc: pic.ref ?? pic.src`) while still calling
      `showPicture(pic.src)` with the live URL for the immediate lightbox.
      Everywhere the transcript renders a persisted `imageSrc` (the
      `PictureBubble` call site and the transcript's lightbox-open click),
      resolve first with
      `const src = resolvePictureRef(turn.imageSrc, companion.pictures);` —
      `null` → render a placeholder instead of `PictureBubble` (terse, no
      lightbox):

```tsx
// A picture from a pack that isn't loaded right now — never substitute.
function MissingPictureBubble() {
  return (
    <div className="text-muted-foreground max-w-[60%] self-start rounded-xl border border-dashed px-3 py-2 text-xs">
      Picture from another pack.
    </div>
  );
}
```

Import `resolvePictureRef` from `@/lib/goonpacks/resolve` (added by Task 7's
amendment block — if Task 7 landed without it, add it there per that block, with
its three resolve.test.ts cases).

- [ ] **Step 4:** `npm run typecheck && npm run lint && npm run build` clean;
      `npm test` green. Manual sanity in the browser is deferred to the user
      (hardware convention) — the e2e in Task 10 covers the flow.
- [ ] **Step 5: Commit** —
      `git commit -am "goonpacks: chooser library UI — import, variants, remove, placeholders"`

---

### Task 9: Retire the build-time picture pipeline + authoring scripts

**Files:**

- Create: `scripts/goonpack-build.mjs`
- Modify: `package.json`, `scripts/describe-missing.mjs`,
  `src/lib/companions/companions.ts`, `.gitignore`
- Delete: `scripts/generate-companion-pictures.mjs`,
  `public/companions/.gitkeep`

- [ ] **Step 1: Drop generated pictures.** In `companions.ts`: remove the
      `COMPANION_PICTURES` import and both `pictures:` entries (Aimee, Miley)
      with their comments. The `CompanionPicture` type and `pictures?` field
      stay (runtime shape, filled by packs).
- [ ] **Step 2: package.json scripts.** Remove `gen:pictures`, `predev`,
      `prebuild`, `prelint`, `pretypecheck`, `pretest`. Rename/add:

```json
"goonpack:describe": "node --env-file-if-exists=.env scripts/describe-image.mjs",
"goonpack:describe-missing": "node --env-file-if-exists=.env scripts/describe-missing.mjs",
"goonpack:build": "node scripts/goonpack-build.mjs",
```

- [ ] **Step 3: Delete** `scripts/generate-companion-pictures.mjs` and
      `src/lib/companions/companion-pictures.generated.ts` (untracked build
      artifact — delete from disk) and `public/companions/.gitkeep`. In
      `.gitignore`: drop the `companion-pictures.generated.ts` block and the
      `!/public/companions/.gitkeep` line; keep `/public/companions/*` with its
      comment rewritten:

```gitignore
# Legacy picture location (pre-goonpacks) — never commit anything here.
/public/companions/*
```

- [ ] **Step 4: Repoint describe-missing.** In `scripts/describe-missing.mjs`:
      change the scan root
      (`const companionsDir = join(root, "public", "companions")`) to
      `const goonpacksDir = join(root, "goonpacks")` and the per-directory loop
      to look in `join(dir, "pictures")` (skip directories without a `pictures/`
      subdir). Update the header comment to say it scans
      `goonpacks/<dir>/pictures/`.
- [ ] **Step 5: Write** `scripts/goonpack-build.mjs`:

```js
// Zips each goonpacks/<dir>/ into goonpacks/<id>.zip — the id read from the
// pack's manifest, so directory names stay free. Run: npm run goonpack:build
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'goonpacks');

let built = 0;
for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(packsDir, entry.name);
  const manifestPath = join(dir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    console.warn(`skipping ${entry.name}: no readable manifest.json`);
    continue;
  }
  const files = {};
  const add = (rel) => {
    files[rel] = new Uint8Array(readFileSync(join(dir, rel)));
  };
  add('manifest.json');
  try {
    statSync(join(dir, 'system-prompt.md'));
    add('system-prompt.md');
  } catch {
    /* overlays may have no prompt */
  }
  try {
    for (const f of readdirSync(join(dir, 'pictures')).sort()) {
      if (f === '.DS_Store') continue;
      add(join('pictures', f));
    }
  } catch {
    /* no pictures dir */
  }
  const out = join(packsDir, `${manifest.id}.zip`);
  writeFileSync(out, zipSync(files, { level: 0 })); // jpegs don't recompress
  console.log(`${entry.name} → ${manifest.id}.zip`);
  built++;
}
console.log(`${built} pack(s) built`);
```

- [ ] **Step 6: Verify.** `npm run goonpack:build` → `2 pack(s) built`,
      `goonpacks/g00ner.aimee.zip` + `g00ner.miley.zip` exist.
      `npm run typecheck && npm run lint && npm test && npm run build` all clean
      (the pre-hooks are gone — confirm `npm run dev` boots without
      `gen:pictures`). `git status` shows no goonpacks/ or public/companions
      files staged.
- [ ] **Step 7: Commit** —
      `git commit -am "goonpacks: authoring scripts; retire build-time picture pipeline"`

---

### Task 10: End-to-end import test

**Files:**

- Create: `tests/e2e/goonpack-import.spec.ts`

- [ ] **Step 1: Write the spec** (zip built in Node at test time — no committed
      binary; dev server keeps the access gate open):

```ts
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

// 1x1 transparent PNG.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const completePack = zipSync({
  'manifest.json': strToU8(
    JSON.stringify({
      format: 1,
      id: 'e2e.testy',
      version: '1.0.0',
      name: 'Testy',
      description: 'e2e import fixture',
      voiceId: 'v-e2e',
      accentColour: 'teal',
    }),
  ),
  'system-prompt.md': strToU8('You are Testy.\n{{OUTPUT_FORMAT_SECTION}}'),
  'pictures/one.png': new Uint8Array(TINY_PNG),
  'pictures/one.txt': strToU8('a test picture'),
});

test('import, persist, and remove a goonpack', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Companions' }).click();

  // Import → confirm sheet shows the manifest info → commit.
  await page.getByTestId('goonpack-file-input').setInputFiles({
    name: 'e2e.testy.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(completePack),
  });
  await expect(page.getByText('e2e.testy · v1.0.0')).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Testy')).toBeVisible();

  // Survives a reload (IndexedDB).
  await page.reload();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Testy')).toBeVisible();

  // Remove — card gone; threads untouched by design (not asserted here).
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Testy')).toHaveCount(0);
});
```

- [ ] **Step 2:** `npm run test:e2e -- goonpack-import` → PASS on chromium,
      firefox, webkit. If the Companions nav button's accessible name differs
      (check how `tests/e2e/voice-tab-switch.spec.ts` reaches screens), mirror
      that spec's navigation exactly.
- [ ] **Step 3: Commit** —
      `git commit -am "goonpacks: e2e import/persist/remove flow"`

---

### Task 11: Docs + changelog

**Files:**

- Create: `GOONPACKS.md`
- Modify: `modes/COMPANIONS.md`, `modes/GOON.md`, `DEVELOPERS.md`,
  `CHANGELOG.md`, `TODO.md`

- [ ] **Step 1: Write `GOONPACKS.md`** (user-facing, terse, no repo mechanics
      beyond the npm commands a user runs):

```markdown
# Goonpacks

A goonpack is one companion in a zip: her pictures, voice, persona and config.
The app imports packs — it never ships, hosts, or points at them (see the
content policy in DEVELOPERS.md).

## Assembling a pack

Lay out a directory and zip its **contents** (the manifest sits at the zip
root):

    manifest.json       who she is — fields are documented at the definition:
                        src/lib/goonpacks/manifest.ts
    system-prompt.md    her persona. Optional {{PLACEHOLDER}} tokens pull in
                        the app's shared prompt sections (names and text in
                        src/lib/companions/shared-prompt.ts); omit a token and
                        that section is simply absent.
    pictures/           optional. jpg/png/webp, each with an optional
                        <name>.txt caption she reads when choosing one.

Two kinds of pack:

- **Complete** — a new companion. Needs `id`, `version`, `name`, `voiceId` and
  `system-prompt.md`.
- **Overlay** — your version of an existing companion: add `base` with her id
  and include only what changes (pictures, voice, prompt). She keeps her
  conversation memory whichever variant you play.

Ids are `publisher.name` (`g00ner.aimee`) and never version — if an update
changes who she is, that's a new companion with a new id. `version` is yours;
the app displays it and nothing else.

With pack sources under `goonpacks/<dir>/`:

- `npm run goonpack:describe-missing` — caption any pictures lacking a `.txt`
  (uses your configured LLM).
- `npm run goonpack:describe <path-to-image>` — caption one image.
- `npm run goonpack:build` — zip every pack directory to `goonpacks/<id>.zip`.

Any zip tool works too.

## Importing

Companions screen → **Import pack**. The pack's info is shown before anything is
stored; importing an id you already have replaces it (threads stay). Removing a
companion pack also removes her overlays — threads still stay.

Packs live in browser storage; keep your zips. If the browser evicts one, the
card asks for the file again — nothing else is lost.

A pack's `voiceId` must exist in the ElevenLabs account the app runs with;
voices don't travel between accounts yet.
```

- [ ] **Step 2: `modes/COMPANIONS.md`** — add a short Goonpacks paragraph (link
      `GOONPACKS.md`): the chooser lists built-ins and imported packs; a
      companion card offers her variants (default + overlays); import/remove
      happens on the chooser. Update the existing picture-pipeline mention:
      pictures now come from packs, not `public/companions/`.
- [ ] **Step 3: `modes/GOON.md` + `DEVELOPERS.md`** —
      `grep -n "gen:pictures\|public/companions\|describe" modes/GOON.md DEVELOPERS.md`
      and rewrite each hit for the new world: describe scripts renamed
      `goonpack:*` and scanning `goonpacks/*/pictures/`; the
      generated-module/pre-hook machinery deleted; the adding-a-companion
      checklist loses its pictures step (built-ins ship pictureless — pictures
      arrive via overlay packs); document the gitignored `goonpacks/` sources
      directory in DEVELOPERS.md (repo mechanics live here, not in
      GOONPACKS.md).
- [ ] **Step 4: `TODO.md`** — delete the `## Goonpacks` section body that this
      work implements, leaving the Phase 2 voices-from-prompts bullet (move it
      to a one-liner under Companions or keep a slim Goonpacks section holding
      only phase 2). Remove nothing else.
- [ ] **Step 5: `CHANGELOG.md`** — new dated section, ordered feature →
      internal:

```markdown
- feature: **Goonpacks** — import a companion as a portable zip: a complete new
  companion, or an overlay that adds pictures or changes the voice/persona of
  one you have. Cards gain variant picking; packs cache in browser storage with
  your zip as the source of truth. Assembly guide in
  [GOONPACKS.md](./GOONPACKS.md).
  ([#N](https://github.com/autogoon/autogoon/pull/N))
- internal: **Retire the build-time picture pipeline** — `gen:pictures`, the
  generated module and its pre-hooks are gone; pictures reach companions via
  goonpacks, and the describe scripts moved to `goonpack:*` scanning
  `goonpacks/*/pictures/`. ([#N](https://github.com/autogoon/autogoon/pull/N))
```

(`#N` = the PR number, filled when the PR exists.)

- [ ] **Step 6:** `npm run format` (commit anything it changes),
      `npm run typecheck && npm run lint && npm test && npm run test:e2e`.
- [ ] **Step 7: Commit** —
      `git commit -am "goonpacks: user docs, dev docs, changelog"`

---

### Task 12: Gates + PR

- [ ] **Step 1:** Full gate run: `npm run typecheck` (no output), `npm run lint`
      (no output), `npm run format` (no changes), `npm test`,
      `npm run test:e2e`.
- [ ] **Step 2:** Run `/doc-check` over the branch diff; fix anything it finds.
- [ ] **Step 3:** Run `/personal-check` (new docs + scripts touch
      content-adjacent ground; `g00ner.*` ids are pseudonymous and fine, but
      verify no local paths or personal details slipped into docs/plan/spec).
- [ ] **Step 4:** Push and open the PR (`git push -u origin goonpacks`,
      `gh pr create`) — **only when the user says to**. Fill the CHANGELOG `#N`
      links with the PR number as part of opening it.

## Self-review notes

- Spec coverage: format/manifest (T1, T3), placeholders (T2), library model +
  variants + last-played (T7, T8), identity/lifecycle incl. replacement confirm,
  base-required, cascade (T7, T8), threads via base id (T6 `applyOverlay` keeps
  `base.id`; migration T5), storage/eviction/index (T4, T7), pictureless
  built-ins + pipeline retirement (T5, T9), authoring tooling (T9), docs (T11),
  errors/validation (T1, T3, surfaced T8), testing (T1-T6 Jest, T10 e2e).
- Deliberate scope cuts, per spec: no in-app authoring/export, no signing, no
  BYO keys, no voice-from-prompt (phase 2, recorded in TODO).
- Known judgment calls an implementer may adjust with the user: exact chooser
  styling of variant rows/remove affordance (copy stays terse); `level: 0` zip
  compression for jpeg-heavy packs.
