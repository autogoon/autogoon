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
      format: 2,
      id: 'e2e.testy',
      version: '1.0.0',
      aboutThePack: 'an e2e test pack',
      companion: {
        name: 'Testy',
        description: 'e2e import fixture',
        voiceId: 'v-e2e',
        accentColour: 'teal',
      },
    }),
  ),
  'system-prompt.md': strToU8('You are Testy.\n{{OUTPUT_FORMAT_SECTION}}'),
  'media/one.png': new Uint8Array(TINY_PNG),
  'media/one.txt': strToU8('a test picture'),
});

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

test('import, persist, and remove a goonpack', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Goonpacks' }).click();

  // Import → confirm sheet shows the manifest info → commit. The pack then
  // lists with what it includes (media/prompt from the tree, voice from the
  // manifest).
  await page.getByTestId('goonpack-file-input').setInputFiles({
    name: 'e2e.testy.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(completePack),
  });
  // The sheet renders the same card the installed row will: id heading, her
  // name on the info line.
  await expect(page.getByText('e2e.testy', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  // The confirm sheet closes only after the store commit lands — wait for it,
  // or its card and the new list row's coexist and the locators go strict.
  await expect(
    page.getByRole('button', { name: 'Import', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Testy · complete companion · 1 picture · prompt · voice'),
  ).toBeVisible();

  // The extracted tree is on disk, marked complete.
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

  // Her card (a clickable div, not a button — the pickers live inside it)
  // shows up on the Companions chooser (a separate screen with its
  // own library instance — it re-syncs on entry).
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Testy', { exact: true })).toBeVisible();

  // Survives a reload (OPFS). The app restores the Companions screen
  // itself from the URL hash pushed on navigation — no click needed, and
  // clicking again would race the restore (the home chooser flashes first).
  await page.reload();
  await expect(page.getByText('Testy', { exact: true })).toBeVisible();

  // Remove on the Goonpacks tab — the list empties and her chooser card goes.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('No packs imported.')).toBeVisible();
  expect(await treeExists(page, 'e2e.testy@1.0.0')).toBe(false);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Testy', { exact: true })).toHaveCount(0);
});

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
