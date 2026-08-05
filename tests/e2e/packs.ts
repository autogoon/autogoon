// Waiting for the Goonpacks tab to have finished loading.
//
// The panel says "Checking packs…" until the load — the OPFS clean pass
// included — has been and gone, so a test that reads storage or asserts an
// absence has to wait for something the panel can only render afterwards.
//
// Elise is that something. `goonpacks/elise/` is the one pack source committed
// to the repo (.gitignore keeps it explicitly), and a dev server plays the
// sources under goonpacks/ off disk, so her row is on the list on any checkout
// — including one where nothing has ever been imported. Waiting for her row
// rather than for "No packs imported." also means every spec doing it runs with
// a disk-backed pack in the library rather than with that path unexercised.

import { expect, type Page } from '@playwright/test';

// A row is labelled `<id> <version>`, and hers are the manifest's.
export const ELISE_ROW = 'g00ner.elise 3.0.0';

export const packsListed = (page: Page): Promise<void> =>
  expect(page.getByText(ELISE_ROW, { exact: true })).toBeVisible();
