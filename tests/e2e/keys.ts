// Seeding the provider keys Companions is gated on.
//
// The Companions play mode and the Goonpacks tab appear only when an OpenRouter
// and an ElevenLabs key are stored (src/lib/companions/keys.ts), so a spec that
// reaches either has to put them there before the page loads. These are
// stand-ins: nothing under tests/e2e/ makes a provider call, and the two
// providers are never contacted by a run.
//
// Pass the context rather than the page where a spec opens a second tab —
// storage is shared, but an init script is not.
import type { BrowserContext, Page } from '@playwright/test';

export async function seedApiKeys(
  target: Page | BrowserContext,
): Promise<void> {
  await target.addInitScript(() => {
    localStorage.setItem('companions:openrouter-key', 'e2e-openrouter');
    localStorage.setItem('companions:elevenlabs-key', 'e2e-elevenlabs');
  });
}
