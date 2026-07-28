/**
 * @jest-environment jsdom
 */
// When the shared Stroke controls are offered at all, and what a pulse sends
// when they are. The pulse lengths themselves are tuned by hand and are not
// asserted — only that a close is scheduled after the open, so no pulse can
// leave a valve held open.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useStrokeControls } from './use-stroke-controls';
import type { PlayerView } from './use-player';
import type { VacuglideDeviceController } from './use-vacuglide-device';

// The device boundary: the two valve calls the hook is asked to make, recorded
// in order with the delay each was given.
type ValveCall = { valve: 'plus' | 'minus'; open: boolean; inMs: number };

const controller = (connected: boolean) => {
  const calls: ValveCall[] = [];
  const record =
    (valve: 'plus' | 'minus') =>
    (open: boolean, inMs = 0): Promise<unknown> => {
      calls.push({ valve, open, inMs });
      return Promise.resolve();
    };
  // Cast: the hook destructures four fields off the controller, and building
  // the whole of useVacuglideDevice's return would fake far more than it reads.
  const vacuglide = {
    valvePlus: record('plus'),
    valveMinus: record('minus'),
    log: () => {},
    connected,
  } as unknown as VacuglideDeviceController;
  return { vacuglide, calls };
};

// Cast for the same reason: canStroke reads two fields of the Player's view.
const view = (isPlaying: boolean, strokeBusy: boolean): PlayerView =>
  ({ isPlaying, strokeBusy }) as unknown as PlayerView;

const controls = ({
  connected = true,
  isPlaying = true,
  strokeBusy = false,
} = {}) => {
  const { vacuglide, calls } = controller(connected);
  const { result } = renderHook(() =>
    useStrokeControls(vacuglide, view(isPlaying, strokeBusy)),
  );
  return { result, calls };
};

const say = (
  result: { current: ReturnType<typeof useStrokeControls> },
  word: 'up' | 'down',
) => {
  act(() => {
    result.current.keywords.find((k) => k.word === word)?.run();
  });
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useStrokeControls', () => {
  it('offers the controls while a program plays and no scheduled stroke is open', () => {
    const { result } = controls();
    expect(result.current.canStroke).toBe(true);
    expect(result.current.keywords.map((k) => k.enabled)).toEqual([true, true]);
  });

  // The regression: the stroke valves only move the device while it is
  // stroking, so the controls used to offer a request that changed nothing.
  it('withholds the controls while nothing is playing', () => {
    const { result } = controls({ isPlaying: false });
    expect(result.current.canStroke).toBe(false);
    expect(result.current.keywords.map((k) => k.enabled)).toEqual([
      false,
      false,
    ]);
  });

  it('withholds the controls while a scheduled stroke holds a valve open', () => {
    const { result } = controls({ strokeBusy: true });
    expect(result.current.canStroke).toBe(false);
    expect(result.current.keywords.map((k) => k.enabled)).toEqual([
      false,
      false,
    ]);
  });

  it('withholds the controls while no device is connected', () => {
    const { result } = controls({ connected: false });
    expect(result.current.canStroke).toBe(false);
    expect(result.current.keywords.map((k) => k.enabled)).toEqual([
      false,
      false,
    ]);
  });

  it('opens stroke+ for "up" and stroke- for "down"', () => {
    const { result, calls } = controls();
    say(result, 'up');
    say(result, 'down');
    expect(calls.filter((c) => c.open).map((c) => c.valve)).toEqual([
      'plus',
      'minus',
    ]);
  });

  it('schedules a close for every open, so no pulse leaves a valve held', () => {
    const { result, calls } = controls();
    say(result, 'down');
    expect(calls).toEqual([
      { valve: 'minus', open: true, inMs: 0 },
      { valve: 'minus', open: false, inMs: expect.any(Number) },
    ]);
    expect(calls[1]!.inMs).toBeGreaterThan(0);
  });

  it('highlights the direction being pulsed until the pulse ends', () => {
    const { result, calls } = controls();
    say(result, 'down');
    expect(result.current.strokePulsing).toBe('minus');
    act(() => {
      jest.advanceTimersByTime(calls[1]!.inMs);
    });
    expect(result.current.strokePulsing).toBeNull();
  });
});
