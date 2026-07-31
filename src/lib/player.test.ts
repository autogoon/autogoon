import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Player } from './player';
import { MIN_RATE, RATE_STEP } from './program';
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
// and manual strokes can't start while a scheduled one is open. Also the
// Player's own duties over any engine: arming one displaces whoever was there,
// regeneration drops and re-pulls the future, and speed is rescaled every tick
// but sent only when the output changes. What an engine generates is decided in
// each engine's own test. Every test here runs on fake timers except
// `Player clock`, which needs real ones and says why.

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

// An engine with a live knob on each channel the Player pulls separately:
// `speed` is the raw value newly generated speed events carry, `strokeAt` the
// offset within each 10 s cycle where a valve opens (null for no overlay), and
// `intensity` the multiplier scale() applies at send time. Like StubEngine it
// keeps a speed cursor; knobChanged() moves that cursor back to the generation
// start, the way the real engines' startFromCurrent does, so a re-pull after
// invalidateFuture covers the span that was dropped.
class KnobStubEngine implements PlayModeEngine {
  speed = 1;
  strokeAt: number | null = null;
  intensity = 1;
  private nextAt = 0;
  private restart = false;
  reset(): void {
    this.nextAt = 0;
    this.restart = false;
  }
  knobChanged(): void {
    this.restart = true;
  }
  generateSpeed(fromTime: number, untilTime: number): SpeedEvent[] {
    if (this.restart) {
      this.restart = false;
      this.nextAt = fromTime;
    }
    const out: SpeedEvent[] = [];
    let t = Math.max(this.nextAt, fromTime);
    while (t < untilTime) {
      out.push({ kind: 'speed', at: t, speed: this.speed });
      t += 10_000;
    }
    this.nextAt = t;
    return out;
  }
  generateValves(
    speedEvents: SpeedEvent[],
    _fromTime: number,
    untilTime: number,
  ): ValveEvent[] {
    const strokeAt = this.strokeAt;
    if (strokeAt === null) return [];
    return speedEvents
      .map((ev): ValveEvent => ({
        kind: 'valve',
        at: ev.at + strokeAt,
        valve: 'minus',
        open: true,
      }))
      .filter((v) => v.at < untilTime);
  }
  scale(event: SpeedEvent): number {
    return event.speed * this.intensity;
  }
}

type ValveCall = { valve: 'plus' | 'minus'; open: boolean; at: number };
// One speed send, in order: a number is targetSpeedSet(speed), 'stop' is
// targetSpeedStop().
type SpeedCall = number | 'stop';

// A fake device recording valve calls with the fake-timer time they land, and
// speed sends in order.
const fakeDevice = () => {
  const calls: ValveCall[] = [];
  const speedSends: SpeedCall[] = [];
  const device = {
    targetSpeedSet: async (speed: number) => {
      speedSends.push(speed);
    },
    targetSpeedStop: async () => {
      speedSends.push('stop');
    },
    valveStrokePlusSet: async (open: boolean) => {
      calls.push({ valve: 'plus', open, at: jest.now() });
    },
    valveStrokeMinusSet: async (open: boolean) => {
      calls.push({ valve: 'minus', open, at: jest.now() });
    },
  } as unknown as VacuglideDevice;
  return { device, calls, speedSends };
};

// A playing Player over the given engine, with device calls timed relative to
// play.
const playing = (engine: PlayModeEngine) => {
  const { device, calls, speedSends } = fakeDevice();
  const player = new Player({ getDevice: () => device });
  player.arm(engine);
  const t0 = jest.now();
  player.play();
  const valveCalls = (valve: 'plus' | 'minus') =>
    calls
      .filter((c) => c.valve === valve)
      .map((c) => ({ open: c.open, at: c.at - t0 }));
  return { player, valveCalls, speedSends };
};

const playingPlayer = (valves: ValveEvent[] = []) =>
  playing(new StubEngine(valves));

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

  it("keeps the pulse's real length at 0.25× playback rate", async () => {
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
  // whose clock has reached 1000) and its close at 2100.
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

  it('reports strokeBusy only while a scheduled stroke is open', async () => {
    const { player } = playingPlayer(SCHEDULED);
    expect(player.getState().strokeBusy).toBe(false);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(player.getState().strokeBusy).toBe(true);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(player.getState().strokeBusy).toBe(false);
    await player.pause();
  });
});

describe('Player transport', () => {
  it('releases a running manual stroke when the clock jumps forward', async () => {
    const { player, valveCalls } = playingPlayer();
    manualStroke(player, 'minus', 4_000);
    await jest.advanceTimersByTimeAsync(200);
    // Anywhere past the pending close at 4000 will do — what matters is that
    // the cursor lands beyond it, not how far the jump went.
    player.seekTo(60_000);
    await jest.advanceTimersByTimeAsync(5_000);
    // The release fires at the jump. The pending manual close at 4000 stays in
    // the program — cancelPendingManual() only scans past the cursor and this
    // event sits on it — but seek() re-places the cursor beyond it, and
    // fireValve() drops a manual close with no manual open in effect, so it
    // never reaches the device.
    expect(valveCalls('minus')).toEqual([
      { open: true, at: 100 },
      { open: false, at: 200 },
    ]);
    await player.pause();
  });
});

describe('Player.arm', () => {
  it("displaces the engine already armed, so the new engine's program drives the device", async () => {
    const { player, speedSends } = playing(new KnobStubEngine());
    await jest.advanceTimersByTimeAsync(500);

    const replacement = new KnobStubEngine();
    replacement.speed = 50;
    player.arm(replacement);
    player.play();
    await jest.advanceTimersByTimeAsync(500);
    expect(speedSends).toEqual([1, 'stop', 50]);
    await player.pause();
  });

  it('sends the speed again for a new program that starts at the same speed', async () => {
    const { player, speedSends } = playing(new KnobStubEngine());
    await jest.advanceTimersByTimeAsync(500);

    player.arm(new KnobStubEngine());
    player.play();
    await jest.advanceTimersByTimeAsync(500);
    expect(speedSends).toEqual([1, 'stop', 1]);
    await player.pause();
  });

  it('resets the clock and the playback rate for a fresh session', async () => {
    const { player } = playing(new StubEngine());
    await jest.advanceTimersByTimeAsync(1_000);
    player.faster();
    expect(player.getState()).toMatchObject({ clock: 1_000, rate: RATE_STEP });

    player.arm(new StubEngine());
    expect(player.getState()).toMatchObject({ clock: 0, rate: 1 });
  });
});

describe('Player device sends', () => {
  it('rescales the in-effect speed every tick but sends only on a change', async () => {
    const engine = new KnobStubEngine();
    const { player, speedSends } = playing(engine);
    await jest.advanceTimersByTimeAsync(500);
    expect(speedSends).toEqual([1]);

    engine.intensity = 2;
    await jest.advanceTimersByTimeAsync(500);
    expect(speedSends).toEqual([1, 2]);
    await player.pause();
  });
});

describe('Player.pause', () => {
  it('stops the speed and closes both valves', async () => {
    const { player, valveCalls, speedSends } = playing(new KnobStubEngine());
    await jest.advanceTimersByTimeAsync(500);
    await player.pause();
    expect(speedSends).toEqual([1, 'stop']);
    expect(valveCalls('plus')).toEqual([{ open: false, at: 500 }]);
    expect(valveCalls('minus')).toEqual([{ open: false, at: 500 }]);
  });
});

// A stub whose generateSpeed records the ctx.currentRawSpeed it was handed, and
// whose first cycle after a knob change starts FROM that speed (like the real
// Groove/companion engines' startFromCurrent).
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

describe('Player regeneration', () => {
  it('drops the not-yet-played tail, so the future carries the new knob', async () => {
    const engine = new KnobStubEngine();
    const { player, speedSends } = playing(engine);
    await jest.advanceTimersByTimeAsync(200);

    engine.speed = 50;
    engine.knobChanged();
    player.invalidateFuture();
    await jest.advanceTimersByTimeAsync(200);
    expect(speedSends).toEqual([1, 50]);
    await player.pause();
  });

  it('re-lays the valve overlay over a byte-identical speed script', async () => {
    const engine = new KnobStubEngine();
    engine.strokeAt = 2_000;
    const { player } = playing(engine);
    await jest.advanceTimersByTimeAsync(200);
    const before = player.upcomingWindow(60_000);

    engine.strokeAt = 5_000;
    player.invalidateValves();
    const after = player.upcomingWindow(60_000);
    expect(after.speed).toEqual(before.speed);
    expect(before.valves.map((v) => v.t)).toEqual([
      1_800, 11_800, 21_800, 31_800, 41_800, 51_800,
    ]);
    expect(after.valves.map((v) => v.t)).toEqual([
      14_800, 24_800, 34_800, 44_800, 54_800,
    ]);
    await player.pause();
  });

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

// How long the clock test plays for, and what one send costs it. The latency is
// a plausible round-trip to the cloud API; the run is long enough to hold ~50
// ticks, so a per-tick shortfall accumulates into a ratio rather than noise.
const SEND_LATENCY_MS = 150;
const CLOCK_RUN_MS = 5_000;

const realSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A device whose speed sends take real time, the way the cloud API's do.
// fakeDevice resolves instantly, which is what keeps every fake-timer test
// deterministic — and exactly what hides the defect this one pins.
const slowDevice = () =>
  ({
    targetSpeedSet: async () => {
      await realSleep(SEND_LATENCY_MS);
    },
    targetSpeedStop: async () => {},
    valveStrokePlusSet: async () => {},
    valveStrokeMinusSet: async () => {},
  }) as unknown as VacuglideDevice;

// One speed event a second — the cadence the real engines generate at — with
// the speed alternating so every event is a change the Player actually sends,
// and every second of play therefore costs a send.
class SecondTickerEngine implements PlayModeEngine {
  private nextAt = 0;
  private n = 0;
  reset(): void {
    this.nextAt = 0;
    this.n = 0;
  }
  generateSpeed(fromTime: number, untilTime: number): SpeedEvent[] {
    const out: SpeedEvent[] = [];
    let t = Math.max(this.nextAt, fromTime);
    while (t < untilTime) {
      out.push({ kind: 'speed', at: t, speed: 40 + (this.n++ % 2) * 10 });
      t += 1_000;
    }
    this.nextAt = t;
    return out;
  }
  generateValves(): ValveEvent[] {
    return [];
  }
  scale(event: SpeedEvent): number {
    return event.speed;
  }
}

// The only test here on real timers, and it has to be: the defect is that
// program-time falls behind wall time, and fake timers advance the clock by
// exactly what the test asks for — a send costing 150 ms costs nothing, so the
// shortfall this measures cannot happen under them.
describe('Player clock', () => {
  it(
    'tracks wall time when each device send costs real milliseconds',
    async () => {
      jest.useRealTimers();
      const device = slowDevice();
      const player = new Player({ getDevice: () => device });
      player.arm(new SecondTickerEngine());

      const startedAt = Date.now();
      player.play();
      await realSleep(CLOCK_RUN_MS);
      await player.pause();
      const realMs = Date.now() - startedAt;

      // Advancing the clock by the nominal TICK_MS rather than the span that
      // actually elapsed put this ratio at about 0.82 with a 150 ms send, and
      // the ratio fell further the slower the device answered. The band is wide because
      // the exact figure is timer slop, not a contract; what it pins is that
      // the clock neither lags the wall nor races it.
      const ratio = player.getState().clock / realMs;
      expect(ratio).toBeGreaterThan(0.95);
      expect(ratio).toBeLessThan(1.05);
    },
    CLOCK_RUN_MS + 15_000,
  );
});
