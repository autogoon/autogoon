import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

// 1x1 transparent PNG.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const completePack = zipSync({
  "manifest.json": strToU8(
    JSON.stringify({
      format: 1,
      id: "e2e.testy",
      version: "1.0.0",
      name: "Testy",
      description: "e2e import fixture",
      voiceId: "v-e2e",
      accentColour: "teal",
    }),
  ),
  "system-prompt.md": strToU8("You are Testy.\n{{OUTPUT_FORMAT_SECTION}}"),
  "pictures/one.png": new Uint8Array(TINY_PNG),
  "pictures/one.txt": strToU8("a test picture"),
});

test("import, persist, and remove a goonpack", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Companions" }).click();

  // Import → confirm sheet shows the manifest info → commit.
  await page.getByTestId("goonpack-file-input").setInputFiles({
    name: "e2e.testy.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(completePack),
  });
  await expect(page.getByText("e2e.testy · v1.0.0")).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Testy")).toBeVisible();

  // Survives a reload (IndexedDB). The app restores the Companions screen
  // itself from the URL hash pushed on navigation — no click needed, and
  // clicking again would race the restore (the home chooser flashes first).
  await page.reload();
  await expect(page.getByText("Testy")).toBeVisible();

  // Remove — card gone; threads untouched by design (not asserted here).
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Testy")).toHaveCount(0);
});
