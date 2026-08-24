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
import { catalogueId } from './model-settings';

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

// How the fastest healthy provider for a model is currently answering. Null
// when OpenRouter reported no figures — an unauthenticated request, or a model
// nobody has called recently.
export type ModelSpeed = {
  provider: string;
  latencyMs: number; // median time to first token
  tps: number; // median tokens per second
};

export type ModelDetail = CatalogueModel & { speed: ModelSpeed | null };

// The fields this app reads out of OpenRouter's payloads. Everything else in
// them (benchmarks, modality, quantisation) is left alone.
type ApiModel = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  supported_parameters?: unknown;
};
type ApiEndpoint = {
  provider_name?: unknown;
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

// The fastest provider currently serving a model. Endpoints OpenRouter has
// marked unhealthy (a negative status) are skipped, and so are ones it has no
// figures for; the rest are ranked by median time to first token, because what
// a spoken turn shows is the pause before the companion answers.
function fastest(endpoints: ApiEndpoint[]): ModelSpeed | null {
  const usable = endpoints
    .filter((e) => num(e.status) >= 0)
    .map((e) => ({
      provider: typeof e.provider_name === 'string' ? e.provider_name : '?',
      latencyMs: num(e.latency_last_30m?.p50),
      tps: num(e.throughput_last_30m?.p50),
    }))
    .filter((e) => e.latencyMs > 0);
  if (usable.length === 0) return null;
  return usable.reduce((best, e) => (e.latencyMs < best.latencyMs ? e : best));
}

// One model in full. Returns null when OpenRouter doesn't know the slug, which
// is what makes this the validation step for a hand-typed one.
export async function fetchModelDetail(
  slug: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelDetail | null> {
  const res = await fetch(
    `${OPENROUTER_API}/models/${catalogueId(slug)}/endpoints`,
    { headers: { authorization: `Bearer ${apiKey}` }, signal },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const body = (await res.json()) as {
    data?: ApiModel & { endpoints?: unknown };
  };
  const data = body.data;
  if (data === undefined) return null;
  const endpoints = Array.isArray(data.endpoints)
    ? (data.endpoints as ApiEndpoint[])
    : [];
  // The list's per-model fields aren't repeated at the top of this payload —
  // context, pricing and parameters belong to each endpoint — so the fastest
  // one stands for the model.
  const first = (endpoints[0] ?? {}) as ApiModel;
  return {
    ...toCatalogueModel({ ...first, id: slug, name: data.name }),
    speed: fastest(endpoints),
  };
}

// USD per million tokens, which is how OpenRouter quotes prices to people even
// though the API quotes them per token.
export const pricePerMillion = (perToken: number): number =>
  perToken * 1_000_000;
