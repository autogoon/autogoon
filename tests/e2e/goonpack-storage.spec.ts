import { expect, test } from '@playwright/test';
import { skipWithoutOpfs } from './opfs';

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
