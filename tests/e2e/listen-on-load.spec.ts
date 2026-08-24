import { expect, test } from '@playwright/test';
import { LISTEN_ON_LOAD_STORAGE_KEY } from '../../src/lib/listen-on-load';

// Whether loading the app opens the microphone. The assertion is on
// getUserMedia itself rather than on the header alone: the button could read
// "Listen" while a stream was already open, and a browser holding the mic
// unasked is the thing this setting exists to prevent.
//
// Both cases wait for the Listen button to become enabled first, which happens
// only once the vosk model has loaded — asserting before that would pass
// against an app that simply hadn't got round to starting yet.

declare global {
  interface Window {
    __micOpened?: boolean;
  }
}

// getUserMedia, stubbed to record that it was called and hand back a stream
// that produces silence, so a start that does happen goes through as usual.
const spyOnTheMic = `
  window.__micOpened = false;
  MediaDevices.prototype.getUserMedia = async () => {
    window.__micOpened = true;
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const silence = ctx.createConstantSource();
    silence.offset.value = 0;
    silence.connect(dest);
    silence.start();
    void ctx.resume();
    return dest.stream;
  };
`;

// The vosk model load is the long pole, as in voice-tab-switch.spec.ts.
const MODEL_LOAD_MS = 90_000;

test('a browser that has not asked for it is never sent to the microphone', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(spyOnTheMic);

  await page.goto('/');
  // The click gives the sticky activation an AudioContext would need, so a
  // failure here is the app choosing to start rather than a browser refusing
  // to let it.
  await page.getByRole('banner').getByText('Autogoon').click();

  // Exact: an accessible name matches as a substring by default, and "Listen"
  // is inside "Listening".
  await expect(
    page.getByRole('button', { name: 'Listen', exact: true }),
  ).toBeEnabled({ timeout: MODEL_LOAD_MS });
  expect(await page.evaluate(() => window.__micOpened)).toBe(false);
});

test('a browser that has asked for it starts listening on load', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(spyOnTheMic);
  await page.addInitScript((key: string) => {
    localStorage.setItem(key, 'true');
  }, LISTEN_ON_LOAD_STORAGE_KEY);

  await page.goto('/');
  await page.getByRole('banner').getByText('Autogoon').click();

  await expect(
    page.getByRole('button', { name: 'Listening', exact: true }),
  ).toBeEnabled({ timeout: MODEL_LOAD_MS });
  expect(await page.evaluate(() => window.__micOpened)).toBe(true);
});
