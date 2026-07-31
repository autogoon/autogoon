// What this file decides: that a connect which never reaches a socket leaves
// the client able to try again, and says so. Everything else in stt.ts needs a
// live socket to reach; the pure lifecycle decisions live in session-policy.ts
// and are tested there.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createStt, type SttEvents } from './stt';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

// The client reports through callbacks only; a test supplies the ones it reads.
const events = (over: Partial<SttEvents> = {}): SttEvents => ({
  onPartial: () => {},
  onCommitted: () => {},
  onPhase: () => {},
  onServerError: () => {},
  onClosed: () => {},
  ...over,
});

function failTokenFetch(): jest.Mock<() => Promise<Response>> {
  const mock = jest.fn<() => Promise<Response>>(() =>
    Promise.reject(new Error('offline')),
  );
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('createStt', () => {
  it('opens again on the next utterance after the token fetch fails', async () => {
    const fetchMock = failTokenFetch();
    const stt = createStt(events());

    stt.beginUtterance(() => []);
    await settle();
    stt.beginUtterance(() => []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a failed token fetch through onServerError rather than going quiet', async () => {
    failTokenFetch();
    const errors: string[] = [];
    const stt = createStt(events({ onServerError: (raw) => errors.push(raw) }));

    stt.beginUtterance(() => []);
    await settle();

    expect(errors).toEqual(['connect failed: offline']);
  });
});
