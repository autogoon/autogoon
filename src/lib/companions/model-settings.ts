// Which model the companions run on, who serves it, and the two switches that
// go with it.
//
// App-wide, not per-companion. These describe one model rather than one
// persona: a pack author has no view on whether replies stream, and the model
// that suits a companion is a choice about cost and speed made by whoever pays
// for it. They live beside the API keys in Settings for the same reason.
//
// Set in Settings and kept in localStorage, per browser — separate from the
// keys (see keys.ts), so forgetting a key doesn't forget the model.

// Which model has been measured, how they timed, and which are ruled out and
// why, are in scripts/llm-benchmark.ts — `npm run llm:benchmark` prints them.
export const DEFAULT_MODEL = 'x-ai/grok-4.6';

// How OpenRouter is asked to choose a provider. The model says what runs; this
// says who runs it, and providers serving the same model differ in price, in
// speed, and in how reliably they execute a tool call — which for a companion
// is the difference between working the toy and talking about it.
//
//   - `normal` — OpenRouter's own price-weighted load balancing.
//   - `nitro` — sorted by throughput.
//   - `floor` — sorted by price.
//   - `exacto` — sorted by tool-calling reliability.
//   - `provider` — one named provider and no fallback.
//
// The first four are slug suffixes (`:nitro` and the rest; `normal` is the bare
// slug). A pin is not a suffix — it is a `provider` field on the request body.
// routingRequest() is where that difference lives, so nothing else carries it.
export const ROUTINGS = [
  'provider',
  'normal',
  'nitro',
  'floor',
  'exacto',
] as const;
export type Routing = (typeof ROUTINGS)[number];

export type ModelSettings = {
  // An OpenRouter model slug, as the catalogue names it — never carrying a
  // routing suffix, which is `routing`'s business.
  model: string;
  routing: Routing;
  // The pinned endpoint's `tag` (model-catalogue.ts). Empty unless `routing` is
  // 'provider' and one has been chosen: leaving the pin clears it, or it would
  // reapply itself the next time 'provider' was.
  provider: string;
  // Stream the reply, or wait for it whole. A spoken turn gains nothing from
  // streaming — the reply is handed to TTS complete either way — so this is
  // about the transcript filling word by word, and about models whose reasoning
  // leaks into the reply when OpenRouter streams the two together.
  stream: boolean;
  // Replay reasoning_details back to the model in the conversation history.
  // Reasoning models answer better for it, since they see how they got where
  // they are; a model with no reasoning to replay ignores it.
  passesReasoning: boolean;
};

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  model: DEFAULT_MODEL,
  routing: 'normal',
  provider: '',
  stream: true,
  passesReasoning: false,
};

// What a chat request says about routing: the model to run, and the `provider`
// field when one is pinned.
//
// `only` with fallbacks off is what pinning means. `order` would name the
// provider first and then quietly go to somebody else the moment they were
// busy, which is the reading of "this provider" that nobody intends.
export type RoutingRequest = {
  model: string;
  provider?: { only: string[]; allow_fallbacks: false };
};

export function routingRequest(settings: ModelSettings): RoutingRequest {
  if (settings.routing === 'provider') {
    // No provider chosen yet: send the model alone rather than an empty
    // allow-list, which OpenRouter would answer with nothing to route to.
    return settings.provider === ''
      ? { model: settings.model }
      : {
          model: settings.model,
          provider: { only: [settings.provider], allow_fallbacks: false },
        };
  }
  return {
    model:
      settings.routing === 'normal'
        ? settings.model
        : `${settings.model}:${settings.routing}`,
  };
}

const MODEL_STORAGE_KEY = 'companions:model';
const ROUTING_STORAGE_KEY = 'companions:routing';
const PROVIDER_STORAGE_KEY = 'companions:provider';
const STREAM_STORAGE_KEY = 'companions:stream';
const PASSES_REASONING_STORAGE_KEY = 'companions:passes-reasoning';

// Anything but one of the five reads as the default: a storage value this
// version doesn't know is a value it can't honour, and routing silently to the
// wrong provider is worse than routing the ordinary way.
const toRouting = (stored: string | null): Routing =>
  ROUTINGS.find((r) => r === stored) ?? DEFAULT_MODEL_SETTINGS.routing;

export function readModelSettings(): ModelSettings {
  try {
    return {
      model: localStorage.getItem(MODEL_STORAGE_KEY) ?? DEFAULT_MODEL,
      routing: toRouting(localStorage.getItem(ROUTING_STORAGE_KEY)),
      provider: localStorage.getItem(PROVIDER_STORAGE_KEY) ?? '',
      // Absent means the default, so only the written value 'false' turns one
      // off — an unset switch must not read as off.
      stream: localStorage.getItem(STREAM_STORAGE_KEY) !== 'false',
      passesReasoning:
        localStorage.getItem(PASSES_REASONING_STORAGE_KEY) === 'true',
    };
  } catch {
    return DEFAULT_MODEL_SETTINGS;
  }
}

export function writeModelSettings(settings: ModelSettings): void {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, settings.model);
    localStorage.setItem(ROUTING_STORAGE_KEY, settings.routing);
    localStorage.setItem(PROVIDER_STORAGE_KEY, settings.provider);
    localStorage.setItem(STREAM_STORAGE_KEY, String(settings.stream));
    localStorage.setItem(
      PASSES_REASONING_STORAGE_KEY,
      String(settings.passesReasoning),
    );
  } catch {
    // ignore: storage full or unavailable
  }
}
