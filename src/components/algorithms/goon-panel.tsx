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
import { JUMP_MS } from "@/lib/program";
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

  // A stable engine identity for the panel's lifetime. The Player identifies its
  // active source by reference (`player.source === engine`, just below), so this
  // must never be re-created on render — a `useMemo` with deps would silently
  // break active-source detection when it recomputed.
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
      // Magnitude knob: intensity is applied in the engine's scale(), which the
      // Player runs every tick — so refresh() just re-sends the current speed at
      // the new ceiling. No need to regenerate the speed script.
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
  // Ending actions (cumming, and Finish = jump to the end of the build) need a
  // device. Scrubbing the timeline (±1 min, faster/slower) and the intensity knob
  // only shape the preview, so they're valid whenever Goon is the current source —
  // connected or not.
  const canEnd = isCurrent && connected;

  const rawPositionMs = isCurrent ? player.positionMs : 0;
  const timeScale = isCurrent ? player.timeScale : 1;
  // ±1 min steps a *displayed* minute. The display is program-time ÷ rate, so the
  // program-time jump scales with the rate (at 4× a "1 min" step covers 4 min of
  // program-time). The timeline caps at the 30-min build: forward never runs past
  // it (the clock may still drift past 30 as Goon holds at top, but scrubbing and
  // the display stop at PROGRAM_MS).
  const jumpMs = JUMP_MS * timeScale;
  const canForward = isCurrent && rawPositionMs < PROGRAM_MS;
  const forward = () =>
    device.seekTo(Math.min(rawPositionMs + jumpMs, PROGRAM_MS));
  const back = () => device.seekTo(Math.max(0, rawPositionMs - jumpMs));

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
    { word: "forward", enabled: canForward, run: forward },
    { word: "back", enabled: isCurrent, run: back },
    {
      word: "finish",
      enabled: canEnd,
      run: () => device.seekTo(PROGRAM_MS),
    },
    { word: "faster", enabled: isCurrent, run: () => device.faster() },
    { word: "slower", enabled: isCurrent, run: () => device.slower() },
    { word: "cumming", enabled: canEnd, run: cumming },
  ];
  useVoiceCommands(active, commands);

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  const positionMs = Math.min(rawPositionMs, PROGRAM_MS);
  const pct = Math.round((positionMs / PROGRAM_MS) * 100);
  // Numbers scale with dilation: at 4× the 30-min build reads 7:30. The bar (a
  // fraction of PROGRAM_MS) is rate-independent, so only the times shrink.
  const displayPositionMs = positionMs / timeScale;
  const displayTotalMs = PROGRAM_MS / timeScale;
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
          <span className="tabular-nums">{formatMs(displayPositionMs)}</span>
          <span className="tabular-nums">
            {formatMs(displayTotalMs)} · {pct}% · {timeScale.toFixed(2)}×
          </span>
        </div>
        <div className="bg-secondary mt-2 h-2 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-linear-to-r from-fuchsia-600 to-rose-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={back}
            disabled={!isCurrent}
            className={jumpClass}
            badge="back"
          >
            − 1 min
          </Button>
          <Button
            onClick={forward}
            disabled={!canForward}
            className={jumpClass}
            badge="forward"
          >
            + 1 min
          </Button>
          <Button
            onClick={() => device.seekTo(PROGRAM_MS)}
            disabled={!canEnd}
            className={jumpClass}
            badge="finish"
          >
            Finish
          </Button>
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={() => device.slower()}
            disabled={!isCurrent}
            className={jumpClass}
            badge="slower"
          >
            Slower
          </Button>
          <Button
            onClick={() => device.faster()}
            disabled={!isCurrent}
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
