// What the catalogue keeps from OpenRouter's payloads, and what it refuses to
// offer.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fetchCatalogue, fetchModelDetail } from './model-catalogue';

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

describe('fetchModelDetail', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('reports the fastest healthy provider, skipping the ones marked down', async () => {
    fetchMock.mockReturnValue(
      json({
        data: {
          name: 'A Model',
          endpoints: [
            {
              provider_name: 'Slow',
              status: 0,
              context_length: 500,
              pricing: { prompt: '0.000001', completion: '0.000002' },
              supported_parameters: ['tools'],
              latency_last_30m: { p50: 3000 },
              throughput_last_30m: { p50: 50 },
            },
            {
              provider_name: 'Broken',
              status: -2,
              latency_last_30m: { p50: 100 },
              throughput_last_30m: { p50: 200 },
            },
            {
              provider_name: 'Quick',
              status: 0,
              latency_last_30m: { p50: 500 },
              throughput_last_30m: { p50: 106 },
            },
          ],
        },
      }),
    );
    const detail = await fetchModelDetail('a/model', 'sk-or-1');
    expect(detail?.speed).toEqual({
      provider: 'Quick',
      latencyMs: 500,
      tps: 106,
    });
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
              status: 0,
              latency_last_30m: null,
              throughput_last_30m: null,
            },
          ],
        },
      }),
    );
    expect((await fetchModelDetail('a/model', 'sk-or-1'))?.speed).toBeNull();
  });

  it('returns null for a model OpenRouter does not know', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    expect(await fetchModelDetail('nobody/nothing', 'sk-or-1')).toBeNull();
  });

  it('asks about the model behind a routing suffix', async () => {
    fetchMock.mockReturnValue(json({ data: { name: 'x', endpoints: [] } }));
    await fetchModelDetail('nex-agi/nex-n2-mini:nitro', 'sk-or-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/models/nex-agi/nex-n2-mini/endpoints',
    );
  });
});
