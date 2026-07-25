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
  'pictures/one.png': new Uint8Array(TINY_PNG),
  'pictures/one.txt': strToU8('a test picture'),
});

test('import, persist, and remove a goonpack', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Goonpacks' }).click();

  // Import → confirm sheet shows the manifest info → commit. The pack then
  // lists with what it includes (pictures/prompt from the zip, voice from the
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

  // Her card (a clickable div, not a button — the pickers live inside it)
  // shows up on the Companions chooser (a separate screen with its
  // own library instance — it re-syncs on entry).
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Testy', { exact: true })).toBeVisible();

  // Survives a reload (IndexedDB). The app restores the Companions screen
  // itself from the URL hash pushed on navigation — no click needed, and
  // clicking again would race the restore (the home chooser flashes first).
  await page.reload();
  await expect(page.getByText('Testy', { exact: true })).toBeVisible();

  // Remove on the Goonpacks tab — the list empties and her chooser card goes.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('No packs imported.')).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Testy', { exact: true })).toHaveCount(0);
});
