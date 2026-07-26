import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

const req = (accessId = 'test-key'): Request =>
  new Request('http://localhost/api/stt-token', {
    method: 'POST',
    headers: { 'x-access-id': accessId },
  });

// Installs the upstream mint endpoint and returns the mock so a test can read
// (or deny) the call the route made to it.
function stubUpstream(body: unknown, status = 200) {
  const fetchMock = jest.fn<typeof fetch>();
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  (global as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('POST /api/stt-token', () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'sk_test_key';
    // The gate is fail-closed: req() sends the matching x-access-id header.
    process.env.COMPANIONS_ACCESS_IDS = 'test-key';
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.COMPANIONS_ACCESS_IDS;
  });

  it('sends ELEVENLABS_API_KEY as the xi-api-key header to the realtime_scribe token endpoint', async () => {
    const fetchMock = stubUpstream({ token: 'sutkn_abc' });
    const { POST } = await import('./route');
    await POST(req());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/v1/single-use-token/realtime_scribe');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(
      'sk_test_key',
    );
  });

  it('returns the minted single-use token to the client and nothing else from the upstream body', async () => {
    // xi_api_key is a sentinel: the exact toEqual below is the only thing that
    // separates "extract the token" from "forward the whole upstream body".
    stubUpstream({ token: 'sutkn_abc', xi_api_key: 'sk_test_key' });
    const { POST } = await import('./route');
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: 'sutkn_abc' });
  });

  it('401s and never calls upstream when the access id is wrong', async () => {
    const fetchMock = stubUpstream({ token: 'sutkn_abc' });
    const { POST } = await import('./route');
    const res = await POST(req('not-a-key'));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('500s when the upstream refuses to mint a token, rather than answering with an undefined token', async () => {
    stubUpstream({ detail: 'quota exceeded' }, 429);
    const { POST } = await import('./route');
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'token mint failed' });
  });

  it('503s when the key is missing without calling upstream', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchMock = stubUpstream({ token: 'sutkn_abc' });
    const { POST } = await import('./route');
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
