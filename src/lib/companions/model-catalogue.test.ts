// What the catalogue keeps from OpenRouter's payloads, and what it refuses to
// offer.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  type ModelDetail,
  candidates,
  fetchCatalogue,
  fetchModelDetail,
  terms,
} from './model-catalogue';

const fetchMock = jest.fn<typeof fetch>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const json = (body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('fetchCatalogue', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('offers only models that can call tools', async () => {
    // A companion works the device and sends media by calling tools, so one
    // without them cannot play at all.
    fetchMock.mockReturnValue(
      json({
        data: [
          {
            id: 'a/talks',
            name: 'Talks',
            context_length: 1000,
            pricing: { prompt: '0.000001', completion: '0.000002' },
            supported_parameters: ['tools', 'reasoning'],
          },
          {
            id: 'b/cannot',
            name: 'Cannot',
            context_length: 1000,
            pricing: { prompt: '0', completion: '0' },
            supported_parameters: ['max_tokens'],
          },
        ],
      }),
    );
    const models = await fetchCatalogue();
    expect(models.map((m) => m.id)).toEqual(['a/talks']);
    expect(models[0]).toMatchObject({
      contextLength: 1000,
      promptPrice: 0.000001,
      completionPrice: 0.000002,
      hasReasoning: true,
    });
  });
});

// Two providers serving one model on different terms, which is the case the
// card exists to show: taking either one's price for "the model's price" quotes
// a number the other is not charging.
const TWO_PROVIDERS = {
  data: {
    name: 'A Model',
    endpoints: [
      {
        provider_name: 'Dear',
        tag: 'dear',
        status: 0,
        context_length: 500,
        pricing: { prompt: '0.000004', completion: '0.000008' },
        supported_parameters: ['tools', 'reasoning'],
        latency_last_30m: { p50: 3000 },
        throughput_last_30m: { p50: 50 },
      },
      {
        provider_name: 'Quick',
        tag: 'quick',
        status: 0,
        context_length: 250,
        pricing: { prompt: '0.000001', completion: '0.000002' },
        supported_parameters: ['tools'],
        latency_last_30m: { p50: 500 },
        throughput_last_30m: { p50: 106 },
      },
    ],
  },
};

describe('fetchModelDetail', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('keeps every provider on its own terms, quickest first', async () => {
    fetchMock.mockReturnValue(json(TWO_PROVIDERS));
    const detail = await fetchModelDetail('a/model', 'sk-or-1');
    expect(detail?.endpoints).toEqual([
      {
        provider: 'Quick',
        tag: 'quick',
        contextLength: 250,
        promptPrice: 0.000001,
        completionPrice: 0.000002,
        hasReasoning: false,
        speed: { latencyMs: 500, tps: 106 },
        down: false,
      },
      {
        provider: 'Dear',
        tag: 'dear',
        contextLength: 500,
        promptPrice: 0.000004,
        completionPrice: 0.000008,
        hasReasoning: true,
        speed: { latencyMs: 3000, tps: 50 },
        down: false,
      },
    ]);
  });

  it('sorts a provider marked down last, however fast it was', async () => {
    fetchMock.mockReturnValue(
      json({
        data: {
          name: 'A Model',
          endpoints: [
            {
              provider_name: 'Broken',
              tag: 'broken',
              status: -2,
              latency_last_30m: { p50: 100 },
              throughput_last_30m: { p50: 200 },
            },
            {
              provider_name: 'Working',
              tag: 'working',
              status: 0,
              latency_last_30m: { p50: 900 },
              throughput_last_30m: { p50: 20 },
            },
          ],
        },
      }),
    );
    const detail = await fetchModelDetail('a/model', 'sk-or-1');
    expect(detail?.endpoints.map((e) => e.tag)).toEqual(['working', 'broken']);
    expect(detail?.endpoints[1]?.down).toBe(true);
  });

  it('reports no speed when OpenRouter has no figures', async () => {
    // Which is what an unauthenticated request gets back — nulls, not an error.
    fetchMock.mockReturnValue(
      json({
        data: {
          name: 'A Model',
          endpoints: [
            {
              provider_name: 'Anyone',
              tag: 'anyone',
              status: 0,
              latency_last_30m: null,
              throughput_last_30m: null,
            },
          ],
        },
      }),
    );
    expect(
      (await fetchModelDetail('a/model', 'sk-or-1'))?.endpoints[0]?.speed,
    ).toBeNull();
  });

  it('returns null for a model OpenRouter does not know', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    expect(await fetchModelDetail('nobody/nothing', 'sk-or-1')).toBeNull();
  });

  it('asks about the slug as stored, which never carries a routing suffix', async () => {
    // Routing is a setting of its own (model-settings.ts); the slug here is the
    // catalogue's own id and goes to OpenRouter unaltered.
    fetchMock.mockReturnValue(json({ data: { name: 'x', endpoints: [] } }));
    await fetchModelDetail('nex-agi/nex-n2-mini', 'sk-or-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/models/nex-agi/nex-n2-mini/endpoints',
    );
  });
});

// The two-provider model, loaded. Throws rather than returning null so the
// tests below can name what they are asserting instead of guarding.
async function load(): Promise<ModelDetail> {
  fetchMock.mockReset();
  fetchMock.mockReturnValue(json(TWO_PROVIDERS));
  const detail = await fetchModelDetail('a/model', 'sk-or-1');
  if (detail === null) throw new Error('the fixture is a known model');
  return detail;
}

describe('candidates', () => {
  it('is the pinned endpoint alone', async () => {
    expect(candidates(await load(), 'dear').map((e) => e.provider)).toEqual([
      'Dear',
    ]);
  });

  it('is every provider that is up when nothing is pinned', async () => {
    expect(candidates(await load(), '').map((e) => e.provider)).toEqual([
      'Quick',
      'Dear',
    ]);
  });

  it('is empty when the pinned provider no longer serves the model', async () => {
    // The card has to say so. Falling back to somebody else would route a
    // request the pin was there to prevent.
    expect(candidates(await load(), 'departed')).toEqual([]);
  });
});

describe('terms', () => {
  it('spans every provider a request could reach, never averaging them', async () => {
    // Which of them answers is OpenRouter's choice at request time, so both
    // ends are quoted: an average is a price nobody charges.
    const spans = terms(candidates(await load(), ''));
    expect(spans).toEqual({
      providers: 2,
      contextLength: { low: 250, high: 500 },
      promptPrice: { low: 0.000001, high: 0.000004 },
      completionPrice: { low: 0.000002, high: 0.000008 },
      latencyMs: { low: 500, high: 3000 },
      tps: { low: 50, high: 106 },
      // Only Dear advertises it, which is enough: Dear may serve the turn.
      hasReasoning: true,
    });
  });

  it('collapses to one figure for a pinned provider', async () => {
    const spans = terms(candidates(await load(), 'quick'));
    expect(spans?.providers).toBe(1);
    expect(spans?.promptPrice).toEqual({ low: 0.000001, high: 0.000001 });
    expect(spans?.hasReasoning).toBe(false);
  });

  it('has no speed when OpenRouter timed none of them', () => {
    expect(
      terms([
        {
          provider: 'Anyone',
          tag: 'anyone',
          contextLength: 100,
          promptPrice: 0,
          completionPrice: 0,
          hasReasoning: false,
          speed: null,
          down: false,
        },
      ])?.latencyMs,
    ).toBeNull();
  });

  it('is null when there is nothing to describe', () => {
    expect(terms([])).toBeNull();
  });
});
