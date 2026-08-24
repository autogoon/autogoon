// The two gates on the route that gives a key away. Both are answered with a
// 404 rather than a refusal, so a build and a LAN request are indistinguishable
// from a route that was never built.
//
// IS_DEV is read when dev-only.ts loads, so each case sets NODE_ENV and then
// imports the route fresh.
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

// NODE_ENV is readonly to TypeScript; the test has to set it regardless, since
// it is the gate under test.
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

async function get(url: string, nodeEnv: string): Promise<Response> {
  setNodeEnv(nodeEnv);
  jest.resetModules();
  const { GET } = await import('./route');
  return GET(new Request(url));
}

describe('GET /api/dev/keys', () => {
  const nodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'sk-or-dev';
    process.env.ELEVENLABS_API_KEY = 'sk_el-dev';
    process.env.LLM_URL = 'https://openrouter.ai/api/v1';
  });

  afterEach(() => {
    setNodeEnv(nodeEnv ?? 'test');
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.LLM_URL;
  });

  it("hands over the server's keys on the dev server, over loopback", async () => {
    const res = await get('http://localhost:8931/api/dev/keys', 'development');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      openRouterKey: 'sk-or-dev',
      elevenLabsKey: 'sk_el-dev',
      llmUrl: 'https://openrouter.ai/api/v1',
    });
  });

  it('404s a LAN request, which dev binding 0.0.0.0 makes reachable', async () => {
    const res = await get(
      'http://192.168.1.100:8931/api/dev/keys',
      'development',
    );
    expect(res.status).toBe(404);
  });

  it('404s in a build, where there are no server keys to give', async () => {
    const res = await get('http://localhost:8931/api/dev/keys', 'production');
    expect(res.status).toBe(404);
  });
});
