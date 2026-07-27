import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  RATE_LIMIT,
  VacuglideDevice,
  type VacuglideState,
} from './vacuglide-device';

// The device's fixed-window rate-limit accounting: RATE_LIMIT requests per
// minute, with the whole counter resetting at once when the window expires
// (mirroring the server's own behaviour — see the comment in
// vacuglide-device.ts).

const STATE: VacuglideState = {
  operationalMode: 'cloud',
  localScript: 0,
  targetSpeed: 0,
  strokePlusValve: false,
  strokeMinusValve: false,
  syncScriptCurrentTime: 0,
  syncScriptOffsetTime: 0,
  syncScriptToken: '',
  syncScriptLoop: false,
};

const T0 = new Date('2026-01-01T00:00:00Z');

describe('VacuglideDevice rate-limit accounting', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    globalThis.fetch = jest.fn<typeof fetch>(
      async () => new Response(JSON.stringify(STATE)),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = realFetch;
  });

  const connectedDevice = (): VacuglideDevice => {
    const device = new VacuglideDevice('test-token');
    device.cluster = 'https://cluster.test';
    return device;
  };

  it('reports an untouched window before any request', () => {
    expect(connectedDevice().rateLimitStatus()).toEqual({
      used: 0,
      remaining: RATE_LIMIT,
      limit: RATE_LIMIT,
      resetSeconds: 0,
    });
  });

  it('counts each request against the current window', async () => {
    const device = connectedDevice();
    await device.getState();
    await device.getState();

    expect(device.rateLimitStatus()).toMatchObject({
      used: 2,
      remaining: RATE_LIMIT - 2,
    });
  });

  it('counts resetSeconds down as the window elapses', async () => {
    const device = connectedDevice();
    await device.getState();

    // A fractional offset: 30.5 s left rounds up to 31, so the status never
    // reports a whole second fewer than the window has left to run.
    jest.setSystemTime(T0.getTime() + 29_500);
    expect(device.rateLimitStatus().resetSeconds).toBe(31);

    jest.setSystemTime(T0.getTime() + 45_000);
    expect(device.rateLimitStatus().resetSeconds).toBe(15);
  });

  it('resets the whole window at once when it expires', async () => {
    const device = connectedDevice();
    await device.getState();
    // Two requests at different points in one window: at T0 + 60 s a sliding
    // window would still be counting the second one, a fixed window neither.
    jest.setSystemTime(T0.getTime() + 30_000);
    await device.getState();

    jest.setSystemTime(T0.getTime() + 60_000);
    expect(device.rateLimitStatus()).toEqual({
      used: 0,
      remaining: RATE_LIMIT,
      limit: RATE_LIMIT,
      resetSeconds: 0,
    });
  });

  it('starts a fresh window with the first request after expiry', async () => {
    const device = connectedDevice();
    await device.getState();

    jest.setSystemTime(T0.getTime() + 90_000);
    await device.getState();
    expect(device.rateLimitStatus().used).toBe(1);
    expect(device.rateLimitStatus().resetSeconds).toBe(60);
  });
});
