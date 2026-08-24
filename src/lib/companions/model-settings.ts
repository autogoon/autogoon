// Which model the companions run on, and the two switches that go with it.
//
// App-wide, not per-companion. These describe one model rather than one
// persona: a pack author has no view on whether replies stream, and the model
// that suits a companion is a choice about cost and speed made by whoever pays
// for it. They live beside the API keys in Settings for the same reason.
//
// Set in Settings and kept in localStorage, per browser — separate from the
// keys (see keys.ts), so forgetting a key doesn't forget the model.

// `:nitro` and `:floor` are routing shorthands rather than model ids — they
// pick a provider by throughput or by price. No model in OpenRouter's catalogue
// is named with one (the only suffixes in the list are `:free`, `:batch` and
// `:thinking`), so a stored slug carrying one has to have it stripped before it
// is looked up.
const ROUTING_SUFFIXES = ['nitro', 'floor'];

// The catalogue id behind a slug, which is the slug itself unless it names a
// routing preference.
export function catalogueId(slug: string): string {
  const colon = slug.lastIndexOf(':');
  if (colon === -1) return slug;
  return ROUTING_SUFFIXES.includes(slug.slice(colon + 1))
    ? slug.slice(0, colon)
    : slug;
}

// Which models have been measured, how they timed, and which are ruled out and
// why, are in scripts/llm-benchmark.ts — `npm run llm:benchmark` prints them.
export const DEFAULT_MODEL = 'x-ai/grok-4.6';

export type ModelSettings = {
  // An OpenRouter model slug. Every companion's turn goes to this one.
  model: string;
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
  stream: true,
  passesReasoning: false,
};

const MODEL_STORAGE_KEY = 'companions:model';
const STREAM_STORAGE_KEY = 'companions:stream';
const PASSES_REASONING_STORAGE_KEY = 'companions:passes-reasoning';

export function readModelSettings(): ModelSettings {
  try {
    return {
      model: localStorage.getItem(MODEL_STORAGE_KEY) ?? DEFAULT_MODEL,
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
    localStorage.setItem(STREAM_STORAGE_KEY, String(settings.stream));
    localStorage.setItem(
      PASSES_REASONING_STORAGE_KEY,
      String(settings.passesReasoning),
    );
  } catch {
    // ignore: storage full or unavailable
  }
}
