// Whether the app connects to the microphone by itself once the recognizer's
// model is ready, or waits to be asked. Off unless it has been turned on, so a
// tab left open is not a tab holding the mic.
//
// Two places touch it and they never need to agree live: the spotter reads it
// once at load to decide whether to start, and Settings writes it for the next
// load. That is why there is no shared state here — just the key and its
// accessors.

const LISTEN_ON_LOAD_STORAGE_KEY = 'autogoon-listen-on-load';

// Anything but a stored "true" reads as off, so a browser with no storage, or
// with a value written by a future version, ends up not holding the mic.
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
