"use client";

// Gooning algorithm panel — presentation only. The algorithm runs in
// useGooningAutopilot at the top of the tree so it keeps going while this panel is
// hidden. Speed/Variability are automatic; the manual controls are the timeline
// jumps (forward/back/finish), the Intensity slider, and the shared Stroke +
// Cumming card.

import type { GooningAutopilotController } from "@/hooks/use-gooning-autopilot";
import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { useCallback } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { RunButton } from "@/components/run-button";
import { Slider } from "@/components/slider";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GooningAutopilotPanel({
  vacuglide,
  gooning,
  kws,
  onStart,
  onStop,
}: {
  vacuglide: VacuglideDeviceController;
  gooning: GooningAutopilotController;
  kws: KeywordSpotterController;
  onStart: () => void;
  onStop: () => void;
}) {
  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  const pct =
    gooning.programMs > 0
      ? Math.round((gooning.positionMs / gooning.programMs) * 100)
      : 0;
  const jumpClass =
    "flex-1 rounded-lg bg-secondary py-3 text-sm font-medium disabled:opacity-40";

  return (
    <section className="flex w-full flex-col gap-4">
      <ListeningFor words={kws.listeningFor} flashing={kws.flashing} />

      <RunButton
        running={gooning.isPlaying}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        className="bg-gradient-to-br from-fuchsia-600 to-rose-500"
      />

      <StrokeCard
        disabled={!gooning.isPlaying}
        strokePulsing={gooning.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
        onCumming={gooning.cumming}
      />

      <Card title="Timeline">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span className="tabular-nums">{formatMs(gooning.positionMs)}</span>
          <span className="tabular-nums">
            {formatMs(gooning.programMs)} · {pct}%
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
            onClick={gooning.back}
            disabled={!gooning.isPlaying}
            className={jumpClass}
            badge="back"
          >
            − 1 min
          </Button>
          <Button
            onClick={gooning.forward}
            disabled={!gooning.isPlaying}
            className={jumpClass}
            badge="forward"
          >
            + 1 min
          </Button>
          <Button
            onClick={gooning.finish}
            disabled={!gooning.isPlaying}
            className={jumpClass}
            badge="finish"
          >
            Finish
          </Button>
        </div>
      </Card>

      <Card title="Up next">
        <Sparkline points={gooning.upcoming} />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>now</span>
          <span>+60s</span>
        </div>
      </Card>

      <Card title="Intensity">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span>Ceiling</span>
          <span className="tabular-nums">{gooning.intensity}%</span>
        </div>
        <Slider
          value={gooning.intensity}
          min={0}
          max={100}
          step={5}
          onChange={gooning.changeIntensity}
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
