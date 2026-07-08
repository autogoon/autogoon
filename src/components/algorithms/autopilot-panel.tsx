"use client";

// Autopilot algorithm panel. Owns the Autopilot engine, arms/plays the shared
// Player, declares its commands once (button == voice). Event generation lives
// in @/lib/algorithms/autopilot-engine.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/card";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { RunButton } from "@/components/run-button";
import { Segmented } from "@/components/segmented";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";
import { useKeywordSpotter } from "@/components/keyword-spotter";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import { useVoiceCommands, type Command } from "@/hooks/use-voice-commands";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import {
  AutopilotEngine,
  type IntensityLevel,
  type EdgeControlLevel,
  type SuctionControlLevel,
} from "@/lib/algorithms/autopilot-engine";

const INTENSITY_LEVELS: IntensityLevel[] = ["warmup", "low", "medium", "high"];
const DEFAULT_INTENSITY: IntensityLevel = "warmup";
const DEFAULT_EDGE: EdgeControlLevel = "moderate";
const DEFAULT_SUCTION: SuctionControlLevel = "more";

export function AutopilotPanel({
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
  const [intensity, setIntensity] = useState<IntensityLevel>(DEFAULT_INTENSITY);
  const [edge, setEdge] = useState<EdgeControlLevel>(DEFAULT_EDGE);
  const [suction, setSuction] = useState<SuctionControlLevel>(DEFAULT_SUCTION);

  const engineRef = useRef<AutopilotEngine | null>(null);
  engineRef.current ??= new AutopilotEngine(
    DEFAULT_INTENSITY,
    DEFAULT_EDGE,
    DEFAULT_SUCTION,
  );
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
    setIntensity(DEFAULT_INTENSITY);
    engine.setIntensity(DEFAULT_INTENSITY);
    setEdge(DEFAULT_EDGE);
    engine.setEdgeControl(DEFAULT_EDGE);
    setSuction(DEFAULT_SUCTION);
    engine.setSuctionControl(DEFAULT_SUCTION);
    device.arm(engine);
  }, [device, engine]);

  const finishMe = useCallback(() => {
    try {
      engine.beginFinish();
      device.invalidateFuture();
    } catch (err) {
      vacuglide.log(`error: ${(err as Error).message}`, "error");
    }
    setIntensity("high");
    setEdge("moderate");
    setSuction("off");
  }, [device, engine, vacuglide]);

  const changeIntensity = useCallback(
    (level: IntensityLevel) => {
      setIntensity(level);
      engine.setIntensity(level);
      // Shape knob — unlike Goon's "intensity". Here the level selects a different
      // generated script, not a scale-time ceiling, so regenerate the future
      // rather than refresh(). (Contrast goon-panel's changeIntensity.)
      device.invalidateFuture();
      vacuglide.log(`intensity → ${level}`);
    },
    [device, engine, vacuglide],
  );
  const stepIntensity = useCallback(
    (delta: number) => {
      const idx = INTENSITY_LEVELS.indexOf(intensity);
      const next =
        INTENSITY_LEVELS[
          Math.max(0, Math.min(INTENSITY_LEVELS.length - 1, idx + delta))
        ];
      if (next !== undefined) changeIntensity(next);
    },
    [intensity, changeIntensity],
  );

  const changeEdge = useCallback(
    (level: EdgeControlLevel) => {
      setEdge(level);
      engine.setEdgeControl(level);
      // Shape knob: edge control changes the generated script, so regenerate.
      device.invalidateFuture();
      vacuglide.log(`edge control → ${level}`);
    },
    [device, engine, vacuglide],
  );

  const changeSuction = useCallback(
    (level: SuctionControlLevel) => {
      setSuction(level);
      engine.setSuctionControl(level);
      // Valve-only: re-lay the suction overlay over the unchanged speed script.
      device.invalidateValves();
      vacuglide.log(`vacuum maintenance → ${level}`);
    },
    [device, engine, vacuglide],
  );

  const connected = vacuglide.connected;
  const canEnd = isCurrent && connected;

  const commands: Command[] = [
    ...stroke.keywords,
    { word: "start", enabled: connected && state !== "playing", run: start },
    { word: "stop", enabled: state === "playing", run: stop },
    { word: "reset", enabled: state !== "playing", run: reset },
    { word: "finish", enabled: canEnd, run: finishMe },
    { word: "more", enabled: isCurrent, run: () => stepIntensity(1) },
    { word: "less", enabled: isCurrent, run: () => stepIntensity(-1) },
    { word: "gentle", enabled: isCurrent, run: () => changeEdge("gentle") },
    { word: "moderate", enabled: isCurrent, run: () => changeEdge("moderate") },
    { word: "intense", enabled: isCurrent, run: () => changeEdge("intense") },
    { word: "off", enabled: isCurrent, run: () => changeSuction("off") },
    { word: "light", enabled: isCurrent, run: () => changeSuction("little") },
    { word: "heavy", enabled: isCurrent, run: () => changeSuction("more") },
  ];
  useVoiceCommands(active, commands);

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  return (
    <section className="flex w-full flex-col gap-4">
      <ListeningFor words={spotter.listeningFor} flashing={spotter.flashing} />

      <RunButton
        state={state}
        connected={connected}
        onStart={start}
        onStop={stop}
        onReset={reset}
        className="bg-linear-to-br from-orange-500 to-pink-500"
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

      <StrokeCard
        strokeDisabled={!stroke.canStroke}
        actionDisabled={!canEnd}
        strokePulsing={stroke.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
        onFinish={finishMe}
      />

      <Card title="Intensity">
        <Segmented
          options={[
            { value: "warmup", label: "Warmup" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
          value={intensity}
          onChange={changeIntensity}
          activeClass="bg-blue-600 text-white"
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Say <code>less</code> / <code>more</code> to step to the previous or
          next level.
        </p>
      </Card>

      <Card title="Edge Control">
        <Segmented
          options={[
            { value: "gentle", label: "Gentle", badge: "gentle" },
            { value: "moderate", label: "Moderate", badge: "moderate" },
            { value: "intense", label: "Intense", badge: "intense" },
          ]}
          value={edge}
          onChange={changeEdge}
          activeClass="bg-orange-500 text-white"
        />
      </Card>

      <Card title="Vacuum Maintenance">
        <Segmented
          options={[
            { value: "off", label: "Off", badge: "off" },
            { value: "little", label: "Light", badge: "light" },
            { value: "more", label: "Heavy", badge: "heavy" },
          ]}
          value={suction}
          onChange={changeSuction}
          activeClass="bg-cyan-600 text-white"
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
