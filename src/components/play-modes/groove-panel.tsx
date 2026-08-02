// Groove play mode panel. Owns the Groove engine, arms/plays the shared Player,
// declares its commands once (button == voice). Event generation lives in
// @/lib/play-modes/groove-engine.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import { CummingButton } from '@/components/cumming-button';
import { LogCard } from '@/components/log-card';
import { RateLimitMeter } from '@/components/rate-limit-meter';
import { SessionControls } from '@/components/session-controls';
import { Segmented } from '@/components/segmented';
import { Slider } from '@/components/slider';
import { Sparkline } from '@/components/sparkline';
import { StrokeCard } from '@/components/stroke-card';
import type { PlayerView } from '@/hooks/use-player';
import { useStrokeControls } from '@/hooks/use-stroke-controls';
import { useVoiceCommands, type Command } from '@/hooks/use-voice-commands';
import type { VacuglideDeviceController } from '@/hooks/use-vacuglide-device';
import {
  GrooveEngine,
  type VariabilityLevel,
} from '@/lib/play-modes/groove-engine';

const DEFAULT_SPEED = 10;
const DEFAULT_VARIABILITY: VariabilityLevel = 'medium';
const DEFAULT_DIP: VariabilityLevel = 'medium';
const DIP_LEVELS: VariabilityLevel[] = ['off', 'low', 'medium', 'high'];
const INTENSITY_STEP = 5;

export function GroovePanel({
  vacuglide,
  player,
  active,
}: {
  vacuglide: VacuglideDeviceController;
  player: PlayerView;
  active: boolean;
}) {
  const device = vacuglide.player;
  const stroke = useStrokeControls(vacuglide, player);
  const [speedPercent, setSpeedPercent] = useState(DEFAULT_SPEED);
  const [variability, setVariability] =
    useState<VariabilityLevel>(DEFAULT_VARIABILITY);
  const [dipVariability, setDipVariability] =
    useState<VariabilityLevel>(DEFAULT_DIP);

  const engineRef = useRef<GrooveEngine | null>(null);
  engineRef.current ??= new GrooveEngine(
    DEFAULT_SPEED,
    DEFAULT_VARIABILITY,
    DEFAULT_DIP,
  );
  const engine = engineRef.current;

  const isCurrent = player.source === engine;
  const state = isCurrent ? player.state : 'armed';

  useEffect(() => {
    if (active && player.state === 'armed' && player.source !== engine) {
      device.arm(engine);
    }
  }, [active, player.state, player.source, device, engine]);

  const start = useCallback(() => {
    if (device.source !== engine) device.arm(engine);
    device.play();
  }, [device, engine]);
  const stop = useCallback(() => {
    void device.pause();
  }, [device]);
  const reset = useCallback(() => {
    setSpeedPercent(DEFAULT_SPEED);
    engine.setSpeedPercent(DEFAULT_SPEED);
    setVariability(DEFAULT_VARIABILITY);
    engine.setVariability(DEFAULT_VARIABILITY);
    setDipVariability(DEFAULT_DIP);
    engine.setDipVariability(DEFAULT_DIP);
    device.arm(engine);
  }, [device, engine]);

  const changeSpeedPercent = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setSpeedPercent(clamped);
      engine.setSpeedPercent(clamped);
      // Magnitude knob: speed is applied in scale() every tick, so a live
      // refresh() re-sends at the new scale without regenerating the script.
      device.refresh();
    },
    [device, engine],
  );
  const stepSpeedPercent = useCallback(
    (delta: number) => changeSpeedPercent(speedPercent + delta),
    [speedPercent, changeSpeedPercent],
  );

  const changeVariability = useCallback(
    (level: VariabilityLevel) => {
      setVariability(level);
      engine.setVariability(level);
      // Shape knob: variability changes the generated dip pattern itself, which
      // scale() can't rescale after the fact — so drop the not-yet-played future
      // and regenerate it from the new setting.
      device.invalidateFuture();
    },
    [device, engine],
  );

  const changeDipVariability = useCallback(
    (level: VariabilityLevel) => {
      setDipVariability(level);
      engine.setDipVariability(level);
      // Shape knob, like variability: the drawn floor changes the dip pattern
      // itself, so drop the not-yet-played future and regenerate it.
      device.invalidateFuture();
    },
    [device, engine],
  );

  // Dip variability has no per-level words of its own — "off"/"low"/"medium"/
  // "high" already belong to timing — so it steps through the levels instead.
  const stepDipVariability = useCallback(
    (delta: number) => {
      const i = DIP_LEVELS.indexOf(dipVariability);
      const next =
        DIP_LEVELS[Math.max(0, Math.min(DIP_LEVELS.length - 1, i + delta))]!;
      if (next !== dipVariability) changeDipVariability(next);
    },
    [dipVariability, changeDipVariability],
  );

  const cumming = useCallback(() => {
    try {
      engine.beginCumming();
      device.invalidateFuture();
      // Cumming can arrive before Start — something may be happening outside
      // the app — so it starts the clock itself (play() no-ops if running).
      device.play();
    } catch (err) {
      vacuglide.log(`error: ${(err as Error).message}`, 'error');
    }
  }, [device, engine, vacuglide]);

  const connected = vacuglide.connected;
  const canEnd = isCurrent && connected;

  const commands: Command[] = [
    ...stroke.keywords,
    { word: 'start', enabled: connected && state !== 'playing', run: start },
    { word: 'stop', enabled: state === 'playing', run: stop },
    { word: 'reset', enabled: state !== 'playing', run: reset },
    {
      word: 'more',
      enabled: isCurrent,
      run: () => stepSpeedPercent(INTENSITY_STEP),
    },
    {
      word: 'less',
      enabled: isCurrent,
      run: () => stepSpeedPercent(-INTENSITY_STEP),
    },
    {
      word: 'hillier',
      enabled: isCurrent,
      run: () => stepDipVariability(1),
    },
    {
      word: 'flatter',
      enabled: isCurrent,
      run: () => stepDipVariability(-1),
    },
    { word: 'off', enabled: isCurrent, run: () => changeVariability('off') },
    { word: 'low', enabled: isCurrent, run: () => changeVariability('low') },
    {
      word: 'medium',
      enabled: isCurrent,
      run: () => changeVariability('medium'),
    },
    { word: 'high', enabled: isCurrent, run: () => changeVariability('high') },
    { word: 'cumming', enabled: canEnd, run: cumming },
  ];
  useVoiceCommands(active, commands);

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, 'error'),
    [vacuglide],
  );

  return (
    <Panel>
      <SessionControls
        state={state}
        connected={connected}
        onStart={start}
        onStop={stop}
        onReset={reset}
      />

      <Card>
        <Sparkline
          points={player.upcoming.speed}
          valves={player.upcoming.valves}
        />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>now</span>
          <span>+60s</span>
        </div>
      </Card>

      <CummingButton onClick={cumming} disabled={!canEnd} />

      <StrokeCard
        strokeDisabled={!stroke.canStroke}
        strokePulsing={stroke.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
      />

      <Card title="Intensity">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span>Ceiling</span>
          <span className="tabular-nums">{speedPercent}%</span>
        </div>
        <Slider
          value={speedPercent}
          min={0}
          max={100}
          step={5}
          onChange={changeSpeedPercent}
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Say <code>less</code> / <code>more</code> to step down or up.
        </p>
      </Card>

      <Card title="Dip variability">
        <Segmented
          options={[
            { value: 'off', label: 'Off' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
          value={dipVariability}
          onChange={changeDipVariability}
          variant="purple"
          disabled={!isCurrent}
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Say <code>flatter</code> / <code>hillier</code> to step down or up.
        </p>
      </Card>

      <Card title="Timing variability">
        <Segmented
          options={[
            { value: 'off', label: 'Off', voiceCommand: 'off' },
            { value: 'low', label: 'Low', voiceCommand: 'low' },
            { value: 'medium', label: 'Medium', voiceCommand: 'medium' },
            { value: 'high', label: 'High', voiceCommand: 'high' },
          ]}
          value={variability}
          onChange={changeVariability}
          variant="purple"
          disabled={!isCurrent}
        />
      </Card>

      <LogCard
        title="Command log"
        header={<RateLimitMeter {...vacuglide.rateLimit} />}
        entries={vacuglide.logEntries}
      />
    </Panel>
  );
}
