// OpenRouter's catalogue, read straight from the browser so the model can be
// chosen by what it costs and how fast it answers rather than by pasting a slug
// and hoping.
//
// Two requests, deliberately kept apart:
//
//   - the list (~650 KB, no key needed) — fetched only when the picker opens;
//   - one model's detail (~4 KB, key required) — fetched when a model is
//     chosen. Latency and throughput are null without a key, which is why the
//     detail request carries one and the list doesn't.
//
// Pinned to OpenRouter rather than to the configured chat endpoint: the pricing
// and endpoint shapes here are OpenRouter's own, and another OpenAI-compatible
// server answering /models says nothing about either.

export const OPENROUTER_API = 'https://openrouter.ai/api/v1';

export type CatalogueModel = {
  id: string;
  name: string;
  contextLength: number;
  // USD per token, as OpenRouter quotes it. Per million is a display concern —
  // see pricePerMillion.
  promptPrice: number;
  completionPrice: number;
  // Whether the model reasons at all, which is what makes passing reasoning
  // back worth switching on.
  hasReasoning: boolean;
};

// How a provider is currently answering. Null when OpenRouter reported no
// figures — an unauthenticated request, or a provider nobody has called
// recently.
export type ModelSpeed = {
  latencyMs: number; // median time to first token
  tps: number; // median tokens per second
};

// One provider serving one model. Price, context and reasoning support are
// theirs rather than the model's: the same model behind two providers can cost
// twice as much, and can be worth pinning for it (see model-settings.ts).
export type ModelEndpoint = {
  provider: string; // the name to show, e.g. "Azure"
  tag: string; // the slug that pins it, e.g. "azure"
  contextLength: number;
  promptPrice: number;
  completionPrice: number;
  hasReasoning: boolean;
  speed: ModelSpeed | null;
  // OpenRouter has marked this one down. Still listed, because a provider that
  // is down now is a provider you may still want pinned, but never proposed as
  // the one answering.
  down: boolean;
};

// One model as its providers serve it. The endpoints are the whole of the
// detail: there is no model-level price or context in this payload, and taking
// one endpoint's figures for the model's would quote a price nobody is
// necessarily charging.
export type ModelDetail = {
  name: string;
  endpoints: ModelEndpoint[];
};

// The fields this app reads out of OpenRouter's payloads. Everything else in
// them (benchmarks, modality, quantisation) is left alone.
type ApiModel = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  supported_parameters?: unknown;
};
type ApiEndpoint = ApiModel & {
  provider_name?: unknown;
  tag?: unknown;
  status?: unknown;
  latency_last_30m?: { p50?: unknown } | null;
  throughput_last_30m?: { p50?: unknown } | null;
};

const num = (value: unknown): number =>
  typeof value === 'number' ? value : Number(value ?? 0) || 0;

const params = (model: ApiModel): string[] =>
  Array.isArray(model.supported_parameters)
    ? (model.supported_parameters as unknown[]).filter(
        (p): p is string => typeof p === 'string',
      )
    : [];

function toCatalogueModel(model: ApiModel): CatalogueModel {
  return {
    id: String(model.id),
    name: typeof model.name === 'string' ? model.name : String(model.id),
    contextLength: num(model.context_length),
    promptPrice: num(model.pricing?.prompt),
    completionPrice: num(model.pricing?.completion),
    hasReasoning: params(model).includes('reasoning'),
  };
}

// A companion drives the device and sends media by calling tools, so a model
// without them cannot play at all — they are filtered out rather than offered
// and left to fail on the first turn.
const callsTools = (model: ApiModel): boolean =>
  params(model).includes('tools');

// Every model a companion could run on, by name. No key: the list is public.
export async function fetchCatalogue(
  signal?: AbortSignal,
): Promise<CatalogueModel[]> {
  const res = await fetch(`${OPENROUTER_API}/models`, { signal });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  const data = Array.isArray(body.data) ? (body.data as ApiModel[]) : [];
  return data
    .filter((m) => typeof m.id === 'string' && callsTools(m))
    .map(toCatalogueModel)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A provider's figures, or null when OpenRouter has none for it. Time to first
// token is the one that has to be there: it is the pause before the companion
// answers, and a zero means unmeasured rather than instant.
function speedOf(endpoint: ApiEndpoint): ModelSpeed | null {
  const latencyMs = num(endpoint.latency_last_30m?.p50);
  if (latencyMs <= 0) return null;
  return { latencyMs, tps: num(endpoint.throughput_last_30m?.p50) };
}

function toEndpoint(endpoint: ApiEndpoint): ModelEndpoint {
  return {
    provider:
      typeof endpoint.provider_name === 'string' ? endpoint.provider_name : '?',
    tag: typeof endpoint.tag === 'string' ? endpoint.tag : '',
    contextLength: num(endpoint.context_length),
    promptPrice: num(endpoint.pricing?.prompt),
    completionPrice: num(endpoint.pricing?.completion),
    hasReasoning: params(endpoint).includes('reasoning'),
    speed: speedOf(endpoint),
    // OpenRouter reports health as a number, negative for a provider it has
    // taken out of rotation.
    down: num(endpoint.status) < 0,
  };
}

// Quickest first, on time to first token, which is the order the list is read
// in. Providers OpenRouter has no figures for follow, and the ones it has
// marked down come last whatever they were timing.
function byFirstToken(a: ModelEndpoint, b: ModelEndpoint): number {
  if (a.down !== b.down) return a.down ? 1 : -1;
  if (a.speed === null || b.speed === null) {
    if (a.speed === b.speed) return a.provider.localeCompare(b.provider);
    return a.speed === null ? 1 : -1;
  }
  return a.speed.latencyMs - b.speed.latencyMs;
}

// One model, as each of its providers serves it. Returns null when OpenRouter
// doesn't know the slug, which is what makes this the validation step for a
// hand-typed one.
export async function fetchModelDetail(
  slug: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelDetail | null> {
  const res = await fetch(`${OPENROUTER_API}/models/${slug}/endpoints`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const body = (await res.json()) as {
    data?: { name?: unknown; endpoints?: unknown };
  };
  const data = body.data;
  if (data === undefined) return null;
  const endpoints = Array.isArray(data.endpoints)
    ? (data.endpoints as ApiEndpoint[])
    : [];
  return {
    name: typeof data.name === 'string' ? data.name : slug,
    endpoints: endpoints.map(toEndpoint).sort(byFirstToken),
  };
}

// The endpoints a request could land on: the pinned one alone, or every
// provider that isn't down. Empty when a pinned tag is no longer served, which
// the caller has to say rather than quietly quoting somebody else.
export function candidates(
  detail: ModelDetail,
  pinned: string,
): ModelEndpoint[] {
  if (pinned !== '') return detail.endpoints.filter((e) => e.tag === pinned);
  const up = detail.endpoints.filter((e) => !e.down);
  return up.length > 0 ? up : detail.endpoints;
}

// Low and high of a figure across the candidates; equal when they agree.
export type Span = { low: number; high: number };

// What a request will cost and how it will perform. Ranges, because only a pin
// knows which endpoint answers: the sorts hand that choice to OpenRouter at
// request time.
export type ModelTerms = {
  providers: number;
  contextLength: Span;
  promptPrice: Span;
  completionPrice: Span;
  // Null when OpenRouter timed none of them, which is what an unauthenticated
  // request gets back.
  latencyMs: Span | null;
  tps: Span | null;
  // Any of them reasons, so passing reasoning back can do something. Every
  // candidate would have to lack it for the switch to be pointless.
  hasReasoning: boolean;
};

const span = (values: number[]): Span => ({
  low: Math.min(...values),
  high: Math.max(...values),
});

export function terms(endpoints: ModelEndpoint[]): ModelTerms | null {
  if (endpoints.length === 0) return null;
  const timed = endpoints
    .map((e) => e.speed)
    .filter((s): s is ModelSpeed => s !== null);
  return {
    providers: endpoints.length,
    contextLength: span(endpoints.map((e) => e.contextLength)),
    promptPrice: span(endpoints.map((e) => e.promptPrice)),
    completionPrice: span(endpoints.map((e) => e.completionPrice)),
    latencyMs: timed.length > 0 ? span(timed.map((s) => s.latencyMs)) : null,
    tps: timed.length > 0 ? span(timed.map((s) => s.tps)) : null,
    hasReasoning: endpoints.some((e) => e.hasReasoning),
  };
}

// USD per million tokens, which is how OpenRouter quotes prices to people even
// though the API quotes them per token.
export const pricePerMillion = (perToken: number): number =>
  perToken * 1_000_000;
