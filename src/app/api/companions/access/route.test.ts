import { describe, it, expect, afterEach } from '@jest/globals';
import { POST } from './route';
import { ACCESS_HEADER } from '@/lib/companions/access';

const req = (id?: string): Request =>
  new Request('http://localhost/api/companions/access', {
    method: 'POST',
    headers: id === undefined ? {} : { [ACCESS_HEADER]: id },
  });

describe('POST /api/companions/access', () => {
  afterEach(() => {
    delete process.env.COMPANIONS_ACCESS_IDS;
  });

  it('401s when no ids are configured (fail closed)', async () => {
    delete process.env.COMPANIONS_ACCESS_IDS;
    const res = await POST(req('anything'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('200s for an id anywhere in COMPANIONS_ACCESS_IDS', async () => {
    process.env.COMPANIONS_ACCESS_IDS = 'alice-7f3a,bob-9c21';
    const res = await POST(req('bob-9c21'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('401s when the request sends no access-id header', async () => {
    process.env.COMPANIONS_ACCESS_IDS = 'alice-7f3a';
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('401s for an id that is not in COMPANIONS_ACCESS_IDS', async () => {
    process.env.COMPANIONS_ACCESS_IDS = 'alice-7f3a';
    const res = await POST(req('nope'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });

  it('keeps validating real ids on the dev server, where the paid routes are open', async () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = 'development';
    try {
      delete process.env.COMPANIONS_ACCESS_IDS;
      expect((await POST(req())).status).toBe(401);
      expect((await POST(req('anything'))).status).toBe(401);
      process.env.COMPANIONS_ACCESS_IDS = 'alice-7f3a';
      expect((await POST(req('alice-7f3a'))).status).toBe(200);
    } finally {
      env.NODE_ENV = previous;
    }
  });
});
