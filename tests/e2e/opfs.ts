import { test, type Page } from '@playwright/test';

// Playwright's WebKit build presents the whole storage API — `getDirectory`
// exists, it reports a 1 GB quota, the context is secure — and then
// `getDirectory()` itself throws "UnknownError: The operation failed for an
// unknown transient reason", reproducibly and at --workers=1. Chromium and
// Firefox both complete a write/read round-trip. Real Safari supports OPFS;
// this is a gap in the test browser, so the check probes the capability rather
// than naming a project — these specs start running by themselves the day
// Playwright's WebKit gains OPFS.
export async function skipWithoutOpfs(page: Page): Promise<void> {
  const usable = await page.evaluate(async () => {
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  });
  test.skip(!usable, "this browser's OPFS is unusable");
}
