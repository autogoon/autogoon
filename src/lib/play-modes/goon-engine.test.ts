import { describe, expect, it } from '@jest/globals';
import type { PlayerContext, SpeedEvent } from '../program';
import { type AfterPlayOption, GoonEngine } from './goon-engine';

// generateSpeed's dip pattern is random by design, so its tests pin the
// guarantees the Player relies on (see program.ts) rather than exact events. The
// after-play scripts, the valve overlay and scale are deterministic, and are
// asserted event for event.

const CTX: PlayerContext = { clock: 0, currentRawSpeed: 0 };

describe('GoonEngine.generateSpeed', () => {
  it("each batch ends after fromTime, so the Player's look-ahead makes progress", () => {
    const engine = new GoonEngine(50);
    let from = 0;
    // Walk several look-ahead batches the way the Player does.
    for (let i = 0; i < 10; i++) {
      const events = engine.generateSpeed(from, from + 60_000, CTX);
      expect(events.length).toBeGreaterThan(0);
      const lastAt = events[events.length - 1]!.at;
      expect(lastAt).toBeGreaterThan(from);
      from = lastAt;
    }
  });

  it('returns events sorted non-decreasing by at', () => {
    const engine = new GoonEngine(50);
    let from = 0;
    for (let i = 0; i < 10; i++) {
      const ats = engine
        .generateSpeed(from, from + 60_000, CTX)
        .map((e) => e.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      from = ats[ats.length - 1]!;
    }
  });

  it('keeps advancing through the taper, where a dip collapses to a peak-to-peak hold', () => {
    // The last few seconds of the build: standardFloor rounds to 100, so both
    // legs of every dip run 100 -> 100. buildLeg's from === to guard is what
    // still consumes the leg time; without it this call never returns.
    const engine = new GoonEngine(100);
    const programMs = 30 * 60_000;
    const events = engine.generateSpeed(programMs - 2_000, programMs, CTX);
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]!.at).toBeGreaterThan(programMs - 2_000);
  }, 1_000);

  it('emits the wind-down once when cumming, then parks', () => {
    const engine = new GoonEngine(50);
    engine.beginCumming();

    const windDown = engine.generateSpeed(0, 60_000, CTX);
    expect(windDown.length).toBeGreaterThan(0);
    // The send-off ramp must be unscaled so an intensity ceiling can't shrink
    // it (see "generateSpeed pitfalls" in DEVELOPERS.md).
    expect(windDown.every((e) => e.unscaled === true)).toBe(true);

    // Parked: nothing more until something changes.
    expect(engine.generateSpeed(60_000, 120_000, CTX)).toEqual([]);
  });

  it('tiles the park at top speed a minute at a time past the configured session length', () => {
    const engine = new GoonEngine(100);
    engine.setProgramMs(10 * 60_000);
    expect(engine.generateSpeed(10 * 60_000, 13 * 60_000, CTX)).toEqual([
      { kind: 'speed', at: 600_000, speed: 100 },
      { kind: 'speed', at: 660_000, speed: 100 },
      { kind: 'speed', at: 720_000, speed: 100 },
    ]);
  });

  it('compresses the build into a shorter session, so the same clock sits further up the ramp', () => {
    const topSpeedAtFiveMinutes = (programMs: number): number => {
      const engine = new GoonEngine(100);
      engine.setProgramMs(programMs);
      const events = engine.generateSpeed(5 * 60_000, 6 * 60_000, CTX);
      return Math.max(...events.map((e) => e.speed));
    };
    // Measured over 300 runs each: five minutes into a 10-minute build the
    // batch tops out at 61..64, and into a 30-minute one at 34.
    expect(topSpeedAtFiveMinutes(10 * 60_000)).toBeGreaterThan(50);
    expect(topSpeedAtFiveMinutes(30 * 60_000)).toBeLessThan(40);
  });

  it('generates an ordinary dip batch after reset(), not another cumming wind-down', () => {
    const engine = new GoonEngine(50);
    engine.beginCumming();
    engine.generateSpeed(0, 60_000, CTX);

    engine.reset();
    const events = engine.generateSpeed(0, 60_000, CTX);
    // The build's first cycle opens on the raw peak under the BUILD_START build
    // speed (25% of 100) and is scalable; a reset that left `cumming` set would
    // hand back the unscaled wind-down instead, stranding the session in the
    // send-off forever.
    expect(events[0]).toEqual({ kind: 'speed', at: 0, speed: 25 });
    expect(events.every((e) => e.unscaled === undefined)).toBe(true);
  });
});

describe('GoonEngine after-play', () => {
  const armed = (option: AfterPlayOption): GoonEngine => {
    const engine = new GoonEngine(50);
    engine.setAfterPlayOptions([option]);
    engine.beginCumming();
    return engine;
  };

  it('defaults to the wind-down', () => {
    expect(new GoonEngine(50).beginCumming()).toBe('wind-down');
  });

  it('picks the sole enabled option', () => {
    const engine = new GoonEngine(50);
    engine.setAfterPlayOptions(['torture']);
    expect(engine.beginCumming()).toBe('torture');
  });

  it('never returns an option outside the enabled set across repeated draws', () => {
    const engine = new GoonEngine(50);
    engine.setAfterPlayOptions(['stay-in', 'eject']);
    for (let i = 0; i < 50; i++) {
      engine.reset();
      expect(['stay-in', 'eject']).toContain(engine.beginCumming());
    }
  });

  it('draws both enabled options over repeated picks', () => {
    const engine = new GoonEngine(50);
    engine.setAfterPlayOptions(['stay-in', 'eject']);
    const drawn = new Set<AfterPlayOption>();
    for (let i = 0; i < 50; i++) {
      engine.reset();
      drawn.add(engine.beginCumming());
    }
    expect([...drawn].sort()).toEqual(['eject', 'stay-in']);
  });

  describe('torture', () => {
    it('slams to full speed, unscaled so the intensity ceiling cannot soften it', () => {
      expect(armed('torture').generateSpeed(1_000, 61_000, CTX)).toEqual([
        { kind: 'speed', at: 1_000, speed: 100, unscaled: true },
      ]);
    });

    it('parks after the slam, leaving full speed in effect', () => {
      const engine = armed('torture');
      engine.generateSpeed(1_000, 61_000, CTX);
      expect(engine.generateSpeed(61_000, 121_000, CTX)).toEqual([]);
    });

    it('closes both valves, settling any manual stroke in flight', () => {
      expect(armed('torture').generateValves([], 1_000, 61_000, CTX)).toEqual([
        { kind: 'valve', at: 1_000, valve: 'minus', open: false },
        { kind: 'valve', at: 1_000, valve: 'plus', open: false },
      ]);
    });
  });

  describe('stay-in', () => {
    it('stops the device dead, unscaled so the intensity ceiling cannot soften it', () => {
      expect(armed('stay-in').generateSpeed(1_000, 61_000, CTX)).toEqual([
        { kind: 'speed', at: 1_000, speed: 0, unscaled: true },
      ]);
    });

    it('parks after the stop, leaving the device at rest', () => {
      const engine = armed('stay-in');
      engine.generateSpeed(1_000, 61_000, CTX);
      expect(engine.generateSpeed(61_000, 121_000, CTX)).toEqual([]);
    });

    it('closes both valves so the seal holds', () => {
      expect(armed('stay-in').generateValves([], 1_000, 61_000, CTX)).toEqual([
        { kind: 'valve', at: 1_000, valve: 'minus', open: false },
        { kind: 'valve', at: 1_000, valve: 'plus', open: false },
      ]);
    });
  });

  describe('eject', () => {
    it('drives speed 40 for 15 seconds, then stops', () => {
      expect(armed('eject').generateSpeed(1_000, 61_000, CTX)).toEqual([
        { kind: 'speed', at: 1_000, speed: 40, unscaled: true },
        { kind: 'speed', at: 16_000, speed: 0, unscaled: true },
      ]);
    });

    it('parks after the push, leaving the device at rest', () => {
      const engine = armed('eject');
      engine.generateSpeed(1_000, 61_000, CTX);
      expect(engine.generateSpeed(61_000, 121_000, CTX)).toEqual([]);
    });

    it('holds stroke+ open for the whole push, then closes it', () => {
      expect(armed('eject').generateValves([], 1_000, 16_000, CTX)).toEqual([
        { kind: 'valve', at: 1_000, valve: 'minus', open: false },
        { kind: 'valve', at: 1_000, valve: 'plus', open: true },
        { kind: 'valve', at: 16_000, valve: 'plus', open: false },
      ]);
    });
  });

  describe('wind-down', () => {
    it('opens stroke-minus 3 s in and closes it at 12 s', () => {
      // fromTime is the Player's clock, never 0 past the first window, so the
      // pulse has to be anchored to it rather than to session start.
      expect(armed('wind-down').generateValves([], 1_000, 20_000, CTX)).toEqual(
        [
          { kind: 'valve', at: 4_000, valve: 'minus', open: true },
          { kind: 'valve', at: 13_000, valve: 'minus', open: false },
        ],
      );
    });
  });
});

describe('GoonEngine.scale', () => {
  const event = (speed: number, unscaled?: boolean): SpeedEvent => ({
    kind: 'speed',
    at: 0,
    speed,
    ...(unscaled === true ? { unscaled } : {}),
  });

  it('applies intensity as a percentage, rounded', () => {
    const engine = new GoonEngine(50);
    expect(engine.scale(event(80))).toBe(40);
    expect(engine.scale(event(25))).toBe(13); // 12.5 rounds up
  });

  it('passes unscaled events through untouched', () => {
    const engine = new GoonEngine(10);
    expect(engine.scale(event(80, true))).toBe(80);
  });

  it('clamps setIntensity to 0..100', () => {
    const engine = new GoonEngine(50);
    engine.setIntensity(150);
    expect(engine.scale(event(80))).toBe(80);
    engine.setIntensity(-10);
    expect(engine.scale(event(80))).toBe(0);
  });
});
