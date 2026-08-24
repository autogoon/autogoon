// Key checking is deliberately one-sided: only an outright rejection fails.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { validateKeys } from './validate-keys';

const fetchMock = jest.fn<typeof fetch>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const keys = {
  openRouterKey: 'sk-or-1',
  elevenLabsKey: 'sk_el-1',
  llmUrl: 'https://openrouter.ai/api/v1',
};

describe('validateKeys', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('fails the key the provider rejected, and only that one', async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        new Response('', {
          status: String(input).includes('elevenlabs') ? 401 : 200,
        }),
      ),
    );
    expect(await validateKeys(keys)).toEqual({
      openRouter: true,
      elevenLabs: false,
    });
  });

  it('accepts an endpoint with no /key rather than calling the key bad', async () => {
    // A self-hosted OpenAI-compatible server answers 404 there.
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    expect((await validateKeys(keys)).openRouter).toBe(true);
  });

  it('accepts when the check itself could not run', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await validateKeys(keys)).toEqual({
      openRouter: true,
      elevenLabs: true,
    });
  });

  it('asks each provider with its own auth header', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    await validateKeys(keys);
    const calls = fetchMock.mock.calls.map(
      ([input, init]) =>
        [String(input), init?.headers as Record<string, string>] as const,
    );
    const openRouter = calls.find(([url]) => url.includes('openrouter'));
    const elevenLabs = calls.find(([url]) => url.includes('elevenlabs'));
    expect(openRouter?.[1]).toEqual({ authorization: 'Bearer sk-or-1' });
    expect(elevenLabs?.[1]).toEqual({ 'xi-api-key': 'sk_el-1' });
  });
});
