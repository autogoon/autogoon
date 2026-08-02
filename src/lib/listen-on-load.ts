// Whether the app connects to the microphone by itself once the recognizer's
// model is ready, or waits to be asked. Off unless it has been turned on.
//
// The spotter reads it once at load; Settings writes it for the next one.
// Neither needs the other's value while running, so this module holds no state
// — only the key and its accessors.

// Exported for the e2e tests, which seed it before the app loads. Startup reads
// it, so the screen can't set it in time.
export const LISTEN_ON_LOAD_STORAGE_KEY = 'autogoon-listen-on-load';

// Anything but a stored "true" reads as off. A browser with no storage, or one
// carrying a value written by a future version, ends up not holding the mic.
export function listensOnLoad(): boolean {
  try {
    return localStorage.getItem(LISTEN_ON_LOAD_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setListensOnLoad(on: boolean): void {
  try {
    localStorage.setItem(LISTEN_ON_LOAD_STORAGE_KEY, on ? 'true' : 'false');
  } catch {
    // ignore: storage full or unavailable
  }
}
