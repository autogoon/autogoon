// A pack played straight out of goonpacks/ on a dev server, with no zip and no
// import. What a directory validates to is pack.test.ts's and what the sources
// hand back is disk-source.test.ts's; this is the one place the whole path runs
// — route, source, merge, validation, screens.
//
// Elise is the subject because `goonpacks/elise/` is committed (.gitignore
// keeps it explicitly, media excluded), so she is on disk on any checkout,
// including one where nothing has ever been imported.
import { expect, test } from '@playwright/test';
import { seedApiKeys } from './keys';
import { ELISE_ROW, packsListed } from './packs';

test('a pack source on disk is listed and playable without being imported', async ({
  page,
}) => {
  await seedApiKeys(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Goonpacks' }).click();
  await packsListed(page);

  // Removing empties a pack out of browser storage, and this one was never put
  // there — it goes by deleting the directory. A button offering otherwise
  // would delete nothing and watch the pack return on the next build.
  const row = page.getByText(ELISE_ROW, { exact: true }).locator('..');
  await expect(row.getByText('on disk')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Remove' })).toHaveCount(0);

  // And she reaches the chooser, which is the point of reading her at all.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Companions' }).click();
  await expect(page.getByText('Elise', { exact: true })).toBeVisible();
});
