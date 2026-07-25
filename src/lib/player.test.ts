import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Player } from './player';
import { MIN_RATE } from './program';
import type {
  PlayModeEngine,
  PlayerContext,
  SpeedEvent,
  ValveEvent,
} from './program';
import type { VacuglideDevice } from './vacuglide-device';

// Player behaviour around ad-hoc (manual) events: insertEvent offsets are REAL
// milliseconds (a manual stroke pulse keeps its real-world length whatever the
// playback rate), and scheduled (engine-generated) strokes take precedence
// over manual ones — a scheduled open releases a running manual stroke first,
// and manual strokes can't start while a scheduled one is open.

// A minimal engine: constant speed 1 every 10 s, plus a fixed valve overlay
// handed to the constructor. Keeps its own speed cursor so repeated
// generateSpeed calls extend rather than repeat; generateValves is pure.
class StubEngine implements PlayModeEngine {
  private nextAt = 0;
  constructor(private valves: ValveEvent[] = []) {}
  reset(): void {
    this.nextAt = 0;
  }
  generateSpeed(fromTime: number, untilTime: number): SpeedEvent[] {
    const out: SpeedEvent[] = [];
    let t = Math.max(this.nextAt, fromTime);
    while (t < untilTime) {
      out.push({ kind: 'speed', at: t, speed: 1 });
      t += 10_000;
    }
    this.nextAt = t;
    return out;
  }
  generateValves(
    _speedEvents: SpeedEvent[],
    fromTime: number,
    untilTime: number,
  ): ValveEvent[] {
    return this.valves.filter((v) => v.at >= fromTime && v.at < untilTime);
  }
  scale(event: SpeedEvent, _ctx: PlayerContext): number {
    return event.speed;
  }
}

type ValveCall = { valve: 'plus' | 'minus'; open: boolean; at: number };

// A fake device recording valve calls with the fake-timer time they land.
const fakeDevice = () => {
  const calls: ValveCall[] = [];
  const device = {
    targetSpeedSet: async () => undefined,
    targetSpeedStop: async () => undefined,
    valveStrokePlusSet: async (open: boolean) => {
      calls.push({ valve: 'plus', open, at: jest.now() });
    },
    valveStrokeMinusSet: async (open: boolean) => {
      calls.push({ valve: 'minus', open, at: jest.now() });
    },
  } as unknown as VacuglideDevice;
  return { device, calls };
};

// A playing Player over a StubEngine, with valve calls timed relative to play.
const playingPlayer = (valves: ValveEvent[] = []) => {
  const { device, calls } = fakeDevice();
  const player = new Player({ getDevice: () => device });
  player.arm(new StubEngine(valves));
  const t0 = jest.now();
  player.play();
  const valveCalls = (valve: 'plus' | 'minus') =>
    calls
      .filter((c) => c.valve === valve)
      .map((c) => ({ open: c.open, at: c.at - t0 }));
  return { player, valveCalls };
};

const manualStroke = (
  player: Player,
  valve: 'plus' | 'minus',
  lengthMs: number,
) => {
  player.insertEvent({ kind: 'valve', valve, open: true });
  player.insertEvent({ kind: 'valve', valve, open: false }, lengthMs);
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Player.insertEvent real-time offsets', () => {
  it('fires a 400 ms pulse 400 ms later at rate 1', async () => {
    const { player, valveCalls } = playingPlayer();
    manualStroke(player, 'minus', 400);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(valveCalls('minus')).toEqual([
      { open: true, at: 100 }, // first tick after insert
      { open: false, at: 500 },
    ]);
    await player.pause();
  });

  it("keeps the pulse's real length under time dilation", async () => {
    const { player, valveCalls } = playingPlayer();
    // Walk the rate down to the MIN_RATE clamp (0.25×) for a deterministic rate.
    for (let i = 0; i < 60; i++) player.slower();
    expect(player.getState().rate).toBe(MIN_RATE);

    manualStroke(player, 'minus', 400);
    await jest.advanceTimersByTimeAsync(2_000);
    const [openEv, closeEv] = valveCalls('minus');
    // Still 400 real ms (one tick of quantisation) — NOT 400 program-ms,
    // which at 0.25× would stretch to 1600 real ms.
    expect(closeEv!.at - openEv!.at).toBeLessThanOrEqual(500);
    expect(closeEv!.at - openEv!.at).toBeGreaterThanOrEqual(400);
    await player.pause();
  });
});

describe('Player scheduled-stroke precedence', () => {
  // A scheduled (engine-generated) minus stroke open over program-time
  // [1000, 2000). At rate 1 its open fires at 1100 real-ms (the first tick
  // with clock past 1000) and its close at 2100.
  const SCHEDULED: ValveEvent[] = [
    { kind: 'valve', at: 1_000, valve: 'minus', open: true },
    { kind: 'valve', at: 2_000, valve: 'minus', open: false },
  ];

  it('releases a running manual stroke before a scheduled open takes over', async () => {
    const { player, valveCalls } = playingPlayer(SCHEDULED);
    manualStroke(player, 'plus', 4_000);
    await jest.advanceTimersByTimeAsync(1_500);
    // The manual release (hold-button up after preemption) must not disturb
    // the scheduled stroke.
    player.insertEvent({ kind: 'valve', valve: 'plus', open: false });
    await jest.advanceTimersByTimeAsync(3_500);

    // The manual plus stroke opened normally, then was force-released the
    // moment the scheduled minus stroke opened — its pending close (at
    // 4000 ms) was cancelled and the late release dropped.
    expect(valveCalls('plus')).toEqual([
      { open: true, at: 100 },
      { open: false, at: 1_100 },
    ]);
    expect(valveCalls('minus')).toEqual([
      { open: true, at: 1_100 },
      { open: false, at: 2_100 },
    ]);
    await player.pause();
  });

  it('drops a manual stroke that lands while a scheduled one is open', async () => {
    const { player, valveCalls } = playingPlayer(SCHEDULED);
    await jest.advanceTimersByTimeAsync(1_500);
    manualStroke(player, 'plus', 400);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(valveCalls('plus')).toEqual([]);
    expect(valveCalls('minus')).toEqual([
      { open: true, at: 1_100 },
      { open: false, at: 2_100 },
    ]);
    await player.pause();
  });

  it('releases a running manual stroke on a transport jump', async () => {
    const { player, valveCalls } = playingPlayer();
    manualStroke(player, 'minus', 4_000);
    await jest.advanceTimersByTimeAsync(200);
    player.forward();
    await jest.advanceTimersByTimeAsync(5_000);
    // Release fires at the jump; the scheduled close is cancelled.
    expect(valveCalls('minus')).toEqual([
      { open: true, at: 100 },
      { open: false, at: 200 },
    ]);
    await player.pause();
  });

  it('reports strokeBusy while a scheduled stroke is open', async () => {
    const { player } = playingPlayer(SCHEDULED);
    expect(player.getState().strokeBusy).toBe(false);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(player.getState().strokeBusy).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(player.getState().strokeBusy).toBe(false);
    await player.pause();
  });
});

// A stub whose generateSpeed records the ctx.currentRawSpeed it was handed, and
// whose first cycle after a knob change starts FROM that speed (like the real
// Groove/companion engines' startFromCurrent). Lets us assert the resume point.
class ResumeStubEngine implements PlayModeEngine {
  seenRawSpeed: number | null = null;
  private resumeNext = false;
  reset(): void {
    this.resumeNext = false;
  }
  knobChanged(): void {
    this.resumeNext = true;
  }
  generateSpeed(
    fromTime: number,
    untilTime: number,
    ctx: PlayerContext,
  ): SpeedEvent[] {
    const out: SpeedEvent[] = [];
    let t = fromTime;
    if (this.resumeNext) {
      this.resumeNext = false;
      this.seenRawSpeed = ctx.currentRawSpeed;
      // Resume from wherever the program is, then hold at the peak.
      out.push({ kind: 'speed', at: t, speed: ctx.currentRawSpeed });
      t += 10_000;
    }
    while (t < untilTime) {
      out.push({ kind: 'speed', at: t, speed: 100 });
      t += 10_000;
    }
    return out;
  }
  generateValves(): ValveEvent[] {
    return [];
  }
  scale(event: SpeedEvent): number {
    return event.speed;
  }
}

describe('Player program-position tracking', () => {
  it("resumes a knob change from the program's point, not 0, while armed", () => {
    const player = new Player({ getDevice: () => null });
    const engine = new ResumeStubEngine();
    // Armed, never started: the program starts at the peak (100).
    player.arm(engine);
    // A knob change while still armed: the engine's next cycle reads
    // ctx.currentRawSpeed. It must see the program's current point (the peak),
    // not 0 (the pre-fix bug ramped up from 0).
    engine.knobChanged();
    player.invalidateFuture();
    expect(engine.seenRawSpeed).toBe(100);
  });
});

describe('Player regeneration keeps pending manual events', () => {
  it('keeps a pending manual close across invalidateFuture', async () => {
    const { player, valveCalls } = playingPlayer();
    manualStroke(player, 'minus', 400);
    await jest.advanceTimersByTimeAsync(200);
    player.invalidateFuture();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(valveCalls('minus')).toEqual([
      { open: true, at: 100 },
      { open: false, at: 500 },
    ]);
    await player.pause();
  });

  it('keeps a pending manual close across invalidateValves', async () => {
    const { player, valveCalls } = playingPlayer();
    manualStroke(player, 'minus', 400);
    await jest.advanceTimersByTimeAsync(200);
    player.invalidateValves();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(valveCalls('minus')).toEqual([
      { open: true, at: 100 },
      { open: false, at: 500 },
    ]);
    await player.pause();
  });
});
