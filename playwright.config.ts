import { defineConfig, devices } from '@playwright/test';

// E2E tests run against the dev server on all three browser engines. The suite
// is local-only for now (no CI), so an already-running dev server is reused.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Generous: the voice test waits for the ~40MB vosk model to load.
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:8931',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8931',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
