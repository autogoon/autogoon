import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The cross-browser proof that the whole voice pipeline works: a synthesized
// utterance goes through the app's real AudioWorklet and vosk recognizer in
// each engine, and the detected algorithm name navigates to its screen.
//
// Only the microphone *hardware* is faked: getUserMedia is stubbed (before the
// app loads) to return a WebAudio-built MediaStream, and window.__testMic
// .speak() plays a committed wav fixture into it exactly once. Everything
// downstream — createMediaStreamSource, the worklet, vosk's worker/WASM,
// grammar and detection routing — is the real thing.

declare global {
  interface Window {
    __testMic?: { speak: () => void };
  }
}

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "autopilot.wav",
);

test("saying an algorithm's name opens its screen", async ({ page }) => {
  // Serve the fixture bytes on a URL only the stub fetches — nothing
  // test-related ships in public/.
  await page.route("**/__fixtures/autopilot.wav", (route) =>
    route.fulfill({ path: FIXTURE, contentType: "audio/wav" }),
  );

  await page.addInitScript(() => {
    // Patch the prototype, not the instance: assigning to
    // navigator.mediaDevices.getUserMedia does not stick in WebKit.
    MediaDevices.prototype.getUserMedia = async () => {
      const ctx = new AudioContext();
      const res = await fetch("/__fixtures/autopilot.wav");
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      const dest = ctx.createMediaStreamDestination();
      // Keep the track producing (silent) frames at all times: Firefox only
      // emits frames while something feeds the destination node, and vosk
      // needs the trailing silence to endpoint the utterance and settle its
      // result. Chromium synthesizes idle silence; Firefox doesn't.
      const silence = ctx.createConstantSource();
      silence.offset.value = 0;
      silence.connect(dest);
      silence.start();
      // The context may have come up suspended; the test clicked before the
      // pipeline started, so with sticky activation this resume sticks.
      void ctx.resume();
      window.__testMic = {
        speak: () => {
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(dest);
          src.start();
        },
      };
      return dest.stream;
    };
  });

  await page.goto("/");

  // The app opens on home — the device group and the algorithm chooser.
  await expect(page.getByText("Choose an algorithm")).toBeVisible();

  // Click (anywhere harmless) BEFORE the audio pipeline comes up: sticky user
  // activation lets Firefox/WebKit run the AudioContexts the app and the stub
  // create during auto-start. In real usage the mic permission prompt's Allow
  // click provides this; the stub bypasses the prompt, so the test provides it.
  await page.getByRole("banner").getByText("Autogoon").click();

  // "Listening" appears only once the pipeline is fully up: model loaded,
  // recognizer created, worklet connected. Audio played after this cannot
  // outrun recognizer creation (the vosk worker handles messages in order).
  await expect(page.getByRole("button", { name: "Listening" })).toBeVisible({
    timeout: 90_000,
  });

  await page.evaluate(() => window.__testMic?.speak());

  // vosk hears "autopilot" and the app navigates to its screen.
  await expect(page.getByText("Vacuum Maintenance")).toBeVisible({
    timeout: 30_000,
  });
});
