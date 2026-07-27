import { expect, test } from '@playwright/test';
import { skipWithoutOpfs } from './opfs';

declare global {
  interface Window {
    // Set by holdImportLock: calling it lets go of the lock.
    __releaseImportLock?: () => void;
  }
}

// Build a pack tree directly in OPFS, optionally marked complete. Returns
// nothing — the assertions read the tree back the same way. `files` is the
// tree's contents, '/'-separated; the default is the least a tree can hold
// while still being one.
async function makeTree(
  page: import('@playwright/test').Page,
  key: string,
  marked: boolean,
  files: Record<string, string> = { 'manifest.json': '{}' },
) {
  await page.evaluate(
    async ({ key, marked, files }) => {
      const root = await navigator.storage.getDirectory();
      const packs = await root.getDirectoryHandle('goonpacks', {
        create: true,
      });
      const dir = await packs.getDirectoryHandle(key, { create: true });
      for (const [path, text] of Object.entries(files)) {
        const parts = path.split('/');
        let at = dir;
        for (const part of parts.slice(0, -1)) {
          at = await at.getDirectoryHandle(part, { create: true });
        }
        const handle = await at.getFileHandle(parts[parts.length - 1]!, {
          create: true,
        });
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
      }
      if (marked) {
        // Beside the directory, not inside it — a pack's tree holds the pack.
        const marker = await packs.getFileHandle(`${key}.complete`, {
          create: true,
        });
        await (await marker.createWritable()).close();
      }
    },
    { key, marked, files },
  );
}

// A tree that passes validation whole: manifest, prompt, and one still with its
// caption. Media bytes are never read, so an empty file is a picture as far as
// everything under test is concerned.
const validPack = (key: string): Record<string, string> => ({
  'manifest.json': JSON.stringify({
    format: 1,
    id: key.slice(0, key.indexOf('@')),
    version: key.slice(key.indexOf('@') + 1),
    aboutThePack: 'a storage test pack',
    companion: { name: 'Storey', voiceId: 'v-e2e' },
  }),
  'system-prompt.md': 'You are Storey.',
  'media/one.png': '',
  'media/one.txt': 'a still',
});

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

// Take the lock an import holds for as long as it is writing a pack's tree, and
// keep holding it until released — what a tab part-way through an import looks
// like to anyone else. Resolves once the lock is actually held, so the sweep
// under test can't run first.
async function holdImportLock(
  page: import('@playwright/test').Page,
  key: string,
) {
  await page.evaluate(
    (k) =>
      new Promise<void>((held) => {
        void navigator.locks.request(`goonpack-import:${k}`, () => {
          held();
          return new Promise<void>((release) => {
            window.__releaseImportLock = release;
          });
        });
      }),
    key,
  );
}

test('the load-time clean pass removes markerless trees only', async ({
  page,
}) => {
  await page.goto('/');
  await skipWithoutOpfs(page);
  // Every panel is mounted from the first paint, so the app sweeps at load —
  // and a sweep running while the fixture is being written would delete a tree
  // whose marker isn't there yet. Let that first pass finish before seeding;
  // the sweep under test is the one on the reload below.
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await expect(page.getByText('No packs imported.')).toBeVisible();

  await makeTree(page, 'kept.pack@1.0.0', true);
  await makeTree(page, 'crashed.pack@1.0.0', false);
  expect(await packKeys(page)).toEqual([
    'crashed.pack@1.0.0',
    'kept.pack@1.0.0',
  ]);

  // The Goonpacks tab mounts the library, which sweeps before it reads. Waiting
  // for a row is what proves the sweep finished — the surviving tree's manifest
  // is '{}', so it reads back as an incompatible pack, which is the first thing
  // rendered that can only exist after the sweep. (Waiting for the loading line
  // to go instead races it: the assertion can pass before the panel first
  // paints, and then the read below overtakes the sweep.)
  await page.reload();
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await expect(
    page.getByText('kept.pack 1.0.0', { exact: true }),
  ).toBeVisible();

  expect(await packKeys(page)).toEqual(['kept.pack@1.0.0']);
});

test('the clean pass spares a tree another tab is importing, and removes it once the lock goes', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await skipWithoutOpfs(page);
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await expect(page.getByText('No packs imported.')).toBeVisible();

  // A markerless tree with its import lock held is a pack being written right
  // now. On disk it is indistinguishable from one a crash abandoned, which is
  // the whole reason the lock exists.
  await makeTree(page, 'busy.pack@1.0.0', false);
  await holdImportLock(page, 'busy.pack@1.0.0');

  // A second tab loads the app, and its clean pass runs against that tree.
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Goonpacks' }).click();
  // The list settles empty — a markerless tree is nobody's installed pack, so
  // survival is read off disk rather than off the screen. Waiting for the empty
  // list is what proves the sweep has been and gone: the panel says "Checking
  // packs…" until the load, sweep included, has finished.
  await expect(other.getByText('No packs imported.')).toBeVisible();
  expect(await packKeys(other)).toEqual(['busy.pack@1.0.0']);

  // The importing tab goes away — a crash, a closed tab, or simply the end of
  // the import. The browser drops the lock with it, and the next clean pass
  // treats the tree as the abandoned import it now is.
  await page.evaluate(() => window.__releaseImportLock?.());
  await page.close();
  await other.reload();
  await other.getByRole('button', { name: 'Goonpacks' }).click();
  await expect(other.getByText('No packs imported.')).toBeVisible();
  expect(await packKeys(other)).toEqual([]);
});

test('a tree another tab is still writing is not offered as an installed pack', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await skipWithoutOpfs(page);
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await expect(page.getByText('No packs imported.')).toBeVisible();

  // An import part-way through: everything the load reads — manifest, prompt,
  // captions — has landed, so the tree validates, and the media list is
  // whatever arrived before the interruption. Nothing about it says "partial"
  // except the missing marker.
  await makeTree(page, 'half.pack@1.0.0', false, validPack('half.pack@1.0.0'));
  await holdImportLock(page, 'half.pack@1.0.0');

  // Another tab loads while that import is running.
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Goonpacks' }).click();
  await expect(other.getByText('No packs imported.')).toBeVisible();
  // The sweep spared the tree — it is still on disk — so the marker check on
  // the load path is the only thing keeping a half-written pack out of the
  // library.
  expect(await packKeys(other)).toEqual(['half.pack@1.0.0']);

  // And it reaches the chooser no more than it reached the list. Aimee is
  // there whatever happens, so waiting for her card is what makes the absence
  // below an absence rather than an unrendered screen.
  await other.getByRole('button', { name: 'Home' }).click();
  await other.getByRole('button', { name: 'Companions' }).click();
  await expect(other.getByText('Aimee', { exact: true })).toBeVisible();
  await expect(other.getByText('Storey', { exact: true })).toHaveCount(0);
});
