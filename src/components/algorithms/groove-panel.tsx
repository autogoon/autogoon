"use client";

// Groove algorithm panel. Owns the Groove engine, arms/plays the shared Player,
// declares its commands once (button == voice). Event generation lives in
// @/lib/algorithms/groove-engine.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/card";
import { CummingButton } from "@/components/cumming-button";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { SessionControls } from "@/components/session-controls";
import { Segmented } from "@/components/segmented";
import { Slider } from "@/components/slider";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";
import { useKeywordSpotter } from "@/components/keyword-spotter";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import { useVoiceCommands, type Command } from "@/hooks/use-voice-commands";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import {
  GrooveEngine,
  type VariabilityLevel,
} from "@/lib/algorithms/groove-engine";

const DEFAULT_SPEED = 10;
const DEFAULT_VARIABILITY: VariabilityLevel = "low";
const SPEED_STEP = 5;

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
  const spotter = useKeywordSpotter();
  const stroke = useStrokeControls(vacuglide);
  const [speedPercent, setSpeedPercent] = useState(DEFAULT_SPEED);
  const [variability, setVariability] =
    useState<VariabilityLevel>(DEFAULT_VARIABILITY);

  const engineRef = useRef<GrooveEngine | null>(null);
  engineRef.current ??= new GrooveEngine(DEFAULT_SPEED, DEFAULT_VARIABILITY);
  const engine = engineRef.current;

  const isCurrent = player.source === engine;
  const state = isCurrent ? player.state : "armed";

  useEffect(() => {
    if (active && player.state === "armed" && player.source !== engine) {
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

  const cumming = useCallback(() => {
    try {
      engine.beginCumming();
      device.invalidateFuture();
    } catch (err) {
      vacuglide.log(`error: ${(err as Error).message}`, "error");
    }
  }, [device, engine, vacuglide]);

  const connected = vacuglide.connected;
  const canEnd = isCurrent && connected;

  const commands: Command[] = [
    ...stroke.keywords,
    { word: "start", enabled: connected && state !== "playing", run: start },
    { word: "stop", enabled: state === "playing", run: stop },
    { word: "reset", enabled: state !== "playing", run: reset },
    {
      word: "faster",
      enabled: isCurrent,
      run: () => stepSpeedPercent(SPEED_STEP),
    },
    {
      word: "slower",
      enabled: isCurrent,
      run: () => stepSpeedPercent(-SPEED_STEP),
    },
    { word: "off", enabled: isCurrent, run: () => changeVariability("off") },
    { word: "low", enabled: isCurrent, run: () => changeVariability("low") },
    {
      word: "medium",
      enabled: isCurrent,
      run: () => changeVariability("medium"),
    },
    { word: "high", enabled: isCurrent, run: () => changeVariability("high") },
    { word: "cumming", enabled: canEnd, run: cumming },
  ];
  useVoiceCommands(active, commands);

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  return (
    <section className="flex w-full flex-col gap-4">
      <ListeningFor words={spotter.listeningFor} flashing={spotter.flashing} />

      <SessionControls
        state={state}
        connected={connected}
        onStart={start}
        onStop={stop}
        onReset={reset}
        className="bg-gradient-to-br from-blue-600 to-cyan-500"
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

      <Card title="Speed">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span>Scale</span>
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
          Say <code>slower</code> / <code>faster</code> to step down or up.
        </p>
      </Card>

      <Card title="Variability">
        <Segmented
          options={[
            { value: "off", label: "Off", badge: "off" },
            { value: "low", label: "Low", badge: "low" },
            { value: "medium", label: "Medium", badge: "medium" },
            { value: "high", label: "High", badge: "high" },
          ]}
          value={variability}
          onChange={changeVariability}
          activeClass="bg-purple-600 text-white"
        />
      </Card>

      <LogCard
        title="Command log"
        header={<RateLimitMeter {...vacuglide.rateLimit} />}
        entries={vacuglide.logEntries}
      />
    </section>
  );
}
