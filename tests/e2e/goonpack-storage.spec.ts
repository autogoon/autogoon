import { expect, test } from '@playwright/test';
import { skipWithoutOpfs } from './opfs';

declare global {
  interface Window {
    // Set by holdImportLock: calling it lets go of the lock.
    __releaseImportLock?: () => void;
  }
}

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

test('the clean pass spares a tree another tab is still importing', async ({
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
  // The tree survives, so the second tab lists it — as an incompatible pack,
  // since a half-written tree is not a valid one. Waiting for that row is what
  // proves the sweep has been and gone.
  await expect(
    other.getByText('busy.pack 1.0.0', { exact: true }),
  ).toBeVisible();
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
