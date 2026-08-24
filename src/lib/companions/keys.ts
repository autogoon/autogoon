// The user's own provider keys, which are what pays for Companions: the browser
// calls OpenRouter and ElevenLabs directly, so these are the whole of the
// configuration and nothing is held server-side. They are entered in Settings
// (or, on the dev server, loaded from `.env` through /api/dev/keys) and kept in
// localStorage, per browser.
//
// Storing a key where any script on the origin can read it is the cost of the
// design: a hosted build has no server to keep it on, and a key kept nowhere
// would be pasted every session. Nothing here reaches the network — the call
// sites (llm/client.ts, voice/tts.ts, voice/stt.ts) send them.

// Where OpenRouter's OpenAI-compatible API lives. The same default the goonpack
// scripts use for an unset LLM_URL (scripts/describe-image.ts).
export const DEFAULT_LLM_URL = 'https://openrouter.ai/api/v1';

const OPENROUTER_STORAGE_KEY = 'companions:openrouter-key';
const ELEVENLABS_STORAGE_KEY = 'companions:elevenlabs-key';
const LLM_URL_STORAGE_KEY = 'companions:llm-url';

export type ApiKeys = {
  openRouterKey: string;
  elevenLabsKey: string;
  // Not a secret — an OpenAI-compatible base URL, shown in plain text in
  // Settings. It travels with the keys because it is set and cleared with them.
  llmUrl: string;
};

const EMPTY: ApiKeys = {
  openRouterKey: '',
  elevenLabsKey: '',
  llmUrl: DEFAULT_LLM_URL,
};

// What this browser has stored (defaults when unset or unavailable).
export function readKeys(): ApiKeys {
  try {
    return {
      openRouterKey: localStorage.getItem(OPENROUTER_STORAGE_KEY) ?? '',
      elevenLabsKey: localStorage.getItem(ELEVENLABS_STORAGE_KEY) ?? '',
      llmUrl: localStorage.getItem(LLM_URL_STORAGE_KEY) ?? DEFAULT_LLM_URL,
    };
  } catch {
    return EMPTY;
  }
}

// Persist all three together: they are entered, loaded and forgotten as a set,
// and a half-saved pair would fail at the first turn instead of at the save.
export function writeKeys(keys: ApiKeys): void {
  try {
    localStorage.setItem(OPENROUTER_STORAGE_KEY, keys.openRouterKey);
    localStorage.setItem(ELEVENLABS_STORAGE_KEY, keys.elevenLabsKey);
    localStorage.setItem(LLM_URL_STORAGE_KEY, keys.llmUrl);
  } catch {
    // ignore: storage full or unavailable
  }
}

// Forget everything — the shared-machine escape hatch.
export function clearKeys(): void {
  try {
    localStorage.removeItem(OPENROUTER_STORAGE_KEY);
    localStorage.removeItem(ELEVENLABS_STORAGE_KEY);
    localStorage.removeItem(LLM_URL_STORAGE_KEY);
  } catch {
    // ignore: storage unavailable
  }
}

// Companions needs all three services, so it needs both keys: OpenRouter for
// the reply, ElevenLabs for hearing you and for speaking. This is the whole
// availability rule — with both, the mode is offered; without, it is hidden.
export function hasKeys(keys: ApiKeys): boolean {
  return keys.openRouterKey !== '' && keys.elevenLabsKey !== '';
}
