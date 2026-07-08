"use client";

// Goon algorithm panel. Owns the Goon engine, arms/plays the shared Player with
// it, and declares its commands once (button == voice). Presentation + wiring;
// event generation lives in @/lib/algorithms/goon-engine.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { RunButton } from "@/components/run-button";
import { Slider } from "@/components/slider";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";
import { useKeywordSpotter } from "@/components/keyword-spotter";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import { useVoiceCommands, type Command } from "@/hooks/use-voice-commands";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { GoonEngine, PROGRAM_MS } from "@/lib/algorithms/goon-engine";
import { formatMs } from "@/lib/format";

const DEFAULT_INTENSITY = 50;
const INTENSITY_STEP = 10;

export function GoonPanel({
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
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);

  const engineRef = useRef<GoonEngine | null>(null);
  engineRef.current ??= new GoonEngine(DEFAULT_INTENSITY);
  const engine = engineRef.current;

  // Goon's slice of the shared player, derived from the view.
  const isCurrent = player.source === engine;
  const state = isCurrent ? player.state : "armed";

  // Build the preview when this tab becomes active while nothing is in progress.
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
    device.arm(engine);
  }, [device, engine]);

  const changeIntensity = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setIntensity(clamped);
      engine.setIntensity(clamped);
      device.refresh();
    },
    [device, engine],
  );
  const stepIntensity = useCallback(
    (delta: number) => changeIntensity(intensity + delta),
    [intensity, changeIntensity],
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
  // Timeline transport moves the Player's clock/rate to drive the device, so it's
  // only meaningful with a device connected — disabled (and out of the grammar)
  // otherwise. Intensity (more/less) shapes the preview, so it stays on isCurrent.
  const canTransport = isCurrent && connected;

  const commands: Command[] = [
    ...stroke.keywords,
    { word: "start", enabled: connected && state !== "playing", run: start },
    { word: "stop", enabled: state === "playing", run: stop },
    { word: "reset", enabled: state !== "playing", run: reset },
    {
      word: "more",
      enabled: isCurrent,
      run: () => stepIntensity(INTENSITY_STEP),
    },
    {
      word: "less",
      enabled: isCurrent,
      run: () => stepIntensity(-INTENSITY_STEP),
    },
    { word: "forward", enabled: canTransport, run: () => device.forward() },
    { word: "back", enabled: canTransport, run: () => device.back() },
    {
      word: "finish",
      enabled: canTransport,
      run: () => device.seekTo(PROGRAM_MS),
    },
    { word: "faster", enabled: canTransport, run: () => device.faster() },
    { word: "slower", enabled: canTransport, run: () => device.slower() },
    { word: "cumming", enabled: canEnd, run: cumming },
  ];
  useVoiceCommands(active, commands);

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  const positionMs = isCurrent ? Math.min(player.positionMs, PROGRAM_MS) : 0;
  const timeScale = isCurrent ? player.timeScale : 1;
  const pct = Math.round((positionMs / PROGRAM_MS) * 100);
  const jumpClass =
    "flex-1 rounded-lg bg-secondary py-3 text-sm font-medium disabled:opacity-40";

  return (
    <section className="flex w-full flex-col gap-4">
      <ListeningFor words={spotter.listeningFor} flashing={spotter.flashing} />

      <RunButton
        state={state}
        connected={connected}
        onStart={start}
        onStop={stop}
        onReset={reset}
        className="bg-linear-to-br from-fuchsia-600 to-rose-500"
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
        onCumming={cumming}
      />

      <Card title="Timeline">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span className="tabular-nums">{formatMs(positionMs)}</span>
          <span className="tabular-nums">
            {formatMs(PROGRAM_MS)} · {pct}% · {timeScale.toFixed(2)}×
          </span>
        </div>
        <div className="bg-secondary mt-2 h-2 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-600 to-rose-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={() => device.back()}
            disabled={!canTransport}
            className={jumpClass}
            badge="back"
          >
            − 1 min
          </Button>
          <Button
            onClick={() => device.forward()}
            disabled={!canTransport}
            className={jumpClass}
            badge="forward"
          >
            + 1 min
          </Button>
          <Button
            onClick={() => device.seekTo(PROGRAM_MS)}
            disabled={!canTransport}
            className={jumpClass}
            badge="finish"
          >
            Finish
          </Button>
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={() => device.slower()}
            disabled={!canTransport}
            className={jumpClass}
            badge="slower"
          >
            Slower
          </Button>
          <Button
            onClick={() => device.faster()}
            disabled={!canTransport}
            className={jumpClass}
            badge="faster"
          >
            Faster
          </Button>
        </div>
      </Card>

      <Card title="Intensity">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span>Ceiling</span>
          <span className="tabular-nums">{intensity}%</span>
        </div>
        <Slider
          value={intensity}
          min={0}
          max={100}
          step={5}
          onChange={changeIntensity}
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Say <code>less</code> / <code>more</code> to step down or up.
        </p>
      </Card>

      <LogCard
        title="Command log"
        header={<RateLimitMeter {...vacuglide.rateLimit} />}
        entries={vacuglide.logEntries}
      />
    </section>
  );
}
