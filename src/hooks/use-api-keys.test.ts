/**
 * @jest-environment jsdom
 */
// Which keys are in force, and — when the dev server was asked and didn't
// answer — saying so. Empty fields on a dev server with a `.env` behind it look
// exactly like a dev server without one, so the difference has to reach the
// card. What the store itself does is companions/keys.test.ts's.
//
// NODE_ENV decides whether the route is asked at all, and the hook reads it per
// call, so each case sets it before mounting.
import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { setEnvKeys } from '@/lib/companions/keys';
import { type ApiKeysState, useApiKeys } from './use-api-keys';

const fetchMock = jest.fn<typeof fetch>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

// NODE_ENV is readonly to TypeScript; the test has to set it regardless, since
// it is what gates the request.
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

const answer = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);

// The hook, mounted under a given NODE_ENV and settled.
async function mounted(nodeEnv: string): Promise<{ current: ApiKeysState }> {
  setNodeEnv(nodeEnv);
  const { result } = renderHook(() => useApiKeys());
  await waitFor(() => expect(result.current.checked).toBe(true));
  return result;
}

describe('useApiKeys', () => {
  const nodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
    localStorage.setItem('companions:openrouter-key', 'pasted-or');
    localStorage.setItem('companions:elevenlabs-key', 'pasted-el');
    // Module state in keys.ts, so one case's `.env` keys would otherwise still
    // be in force for the next.
    setEnvKeys(null);
  });

  afterEach(() => {
    setNodeEnv(nodeEnv ?? 'test');
  });

  it('never asks the route in a build, where it does not exist', async () => {
    const result = await mounted('production');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.keys.openRouterKey).toBe('pasted-or');
    expect(result.current.fromEnv).toBe(false);
    expect(result.current.envFailure).toBeNull();
  });

  it("runs on the dev server's .env over anything pasted", async () => {
    fetchMock.mockReturnValue(
      answer({
        openRouterKey: 'env-or',
        elevenLabsKey: 'env-el',
        llmUrl: 'https://env.test/v1',
      }),
    );
    const result = await mounted('development');
    expect(result.current.keys.openRouterKey).toBe('env-or');
    expect(result.current.fromEnv).toBe(true);
    expect(result.current.envFailure).toBeNull();
    // Not written: the whole point of the `.env` path.
    expect(localStorage.getItem('companions:openrouter-key')).toBe('pasted-or');
  });

  it('reports nothing wrong when the route answers with no keys', async () => {
    // No `.env` behind the dev server is the ordinary case, not a failure.
    fetchMock.mockReturnValue(
      answer({ openRouterKey: '', elevenLabsKey: '', llmUrl: 'x' }),
    );
    const result = await mounted('development');
    expect(result.current.fromEnv).toBe(false);
    expect(result.current.envFailure).toBeNull();
    expect(result.current.keys.openRouterKey).toBe('pasted-or');
  });

  it('says so when the route was there and would not answer', async () => {
    // Silently falling back to the pasted path leaves fields that look exactly
    // like a dev server with no `.env` at all.
    fetchMock.mockReturnValue(answer('', 500));
    const result = await mounted('development');
    expect(result.current.fromEnv).toBe(false);
    expect(result.current.envFailure).toBe('/api/dev/keys — 500');
  });

  it('says so when the request never got there', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const result = await mounted('development');
    expect(result.current.envFailure).toBe('offline');
  });
});
