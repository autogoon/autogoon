import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { skipWithoutOpfs } from './opfs';
import { packsListed } from './packs';

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
      aboutThePack: 'an e2e test pack',
      intro: 'an e2e test scene',
      mediaSummary: 'One test picture.',
      companion: {
        name: 'Testy',
        description: 'e2e import fixture',
        voiceId: 'v-e2e',
        accentColour: 'teal',
        timezone: 'Europe/London',
      },
    }),
  ),
  'system-prompt.md': strToU8('You are Testy.\n{{OUTPUT_FORMAT_SECTION}}'),
  'media/one.png': new Uint8Array(TINY_PNG),
  'media/one.md': strToU8(
    '---\ncaption: "a test picture"\n---\n\nA test picture, described at length.\n',
  ),
});

// A pack zip built to order: the manifest, a system prompt, and any media given.
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

const importErrors = (page: import('@playwright/test').Page) =>
  page.getByTestId('import-error');

// Import a zip and return the error lines the panel showed, or [] on success.
async function importZip(
  page: import('@playwright/test').Page,
  name: string,
  buffer: Buffer,
): Promise<string[]> {
  const errors = importErrors(page);
  const confirm = page.getByRole('button', { name: 'Import', exact: true });
  // Every panel is mounted from the first paint, so the file input is reachable
  // before the Goonpacks screen is the visible one — and the confirm sheet and
  // the error lines below are only visible on it.
  await expect(page.getByRole('button', { name: 'Import pack' })).toBeVisible();
  await page
    .getByTestId('goonpack-file-input')
    .setInputFiles({ name, mimeType: 'application/zip', buffer });
  // prepareImport streams the zip, so neither outcome is synchronous: wait for
  // whichever arrives — the confirm sheet, or the errors shown in its place.
  await expect(confirm.or(errors).first()).toBeVisible();
  if ((await confirm.count()) > 0) {
    await confirm.click();
    // The sheet closes only once commit() has settled, and the library is
    // rebuilt before that — so the installed row, or the error, is on screen.
    await expect(confirm).toHaveCount(0);
  }
  return errors.allTextContents();
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

// Import the complete pack through the UI, leaving the Goonpacks screen with
// the pack installed — the arrange step for anything that needs one on disk.
async function installCompletePack(page: import('@playwright/test').Page) {
  await page.goto('/');
  await skipWithoutOpfs(page);
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await page.getByTestId('goonpack-file-input').setInputFiles({
    name: 'e2e.testy.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(completePack),
  });
  // The confirm sheet renders the same card the installed row will, before
  // anything is stored: the id and version head it.
  await expect(
    page.getByText('e2e.testy 1.0.0', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  // The confirm sheet closes only after the store commit lands — wait for it,
  // or its card and the new list row are both on screen and the locators go
  // strict.
  await expect(
    page.getByRole('button', { name: 'Import', exact: true }),
  ).toHaveCount(0);
}

test('importing a pack puts its tree on disk and offers it on the chooser', async ({
  page,
}) => {
  await installCompletePack(page);

  // The row says what the pack includes: media and prompt read from the tree,
  // voice from the manifest.
  await expect(
    page.getByText('Testy · complete companion · 1 picture · prompt · voice'),
  ).toBeVisible();

  // The extracted tree is on disk, marked complete.
  expect(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const packs = await root.getDirectoryHandle('goonpacks');
      const dir = await packs.getDirectoryHandle('e2e.testy@1.0.0');
      // The marker is a sibling of the tree, so it is the root that holds it.
      await packs.getFileHandle('e2e.testy@1.0.0.complete');
      const media = await dir.getDirectoryHandle('media');
      const names: string[] = [];
      for await (const name of media.keys()) names.push(name);
      return names.sort();
    }),
  ).toEqual(['one.md', 'one.png']);

  // Testy's card (a clickable div, not a button — the pickers live inside it)
  // shows up on the Companions chooser, which watches the same one index this
  // screen just rebuilt.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Testy', { exact: true })).toBeVisible();
});

test('an imported pack survives a reload', async ({ page }) => {
  await installCompletePack(page);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Testy', { exact: true })).toBeVisible();

  // The app restores the Companions screen itself from the URL hash pushed on
  // navigation — no click needed, and clicking again would race the restore
  // (the home chooser flashes first).
  await page.reload();
  await expect(page.getByText('Testy', { exact: true })).toBeVisible();
});

test('removing a pack deletes its tree and its chooser card', async ({
  page,
}) => {
  await installCompletePack(page);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  // Elise's row is what says the rebuild has rendered — she is a pack source
  // on disk and never leaves the list — so Testy's absence beside her is an
  // absence rather than a list that hasn't come back yet.
  await packsListed(page);
  await expect(page.getByText('e2e.testy', { exact: true })).toHaveCount(0);
  expect(await treeExists(page, 'e2e.testy@1.0.0')).toBe(false);

  // Aimee is on the chooser whatever happens, so waiting for her card is what
  // makes Testy's absence an absence rather than an unrendered screen.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Aimee', { exact: true })).toBeVisible();
  await expect(page.getByText('Testy', { exact: true })).toHaveCount(0);
});

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
