"use client";

// Goon algorithm panel — presentation only. The algorithm runs in
// useGoon at the top of the tree so it keeps going while this panel is
// hidden. Speed/Variability are automatic; the manual controls are the timeline
// jumps (forward/back/finish), the Intensity slider, and the shared Stroke +
// Cumming card.

import type { GoonController } from "@/hooks/use-goon";
import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import type { PlayerView } from "@/hooks/use-player";
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

export function GoonPanel({
  vacuglide,
  goon,
  player,
  kws,
  onStart,
  onStop,
  onReset,
}: {
  vacuglide: VacuglideDeviceController;
  goon: GoonController;
  player: PlayerView;
  kws: KeywordSpotterController;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  // Timeline position/rate come from the shared player; blank them out unless
  // Goon is the active source, and clamp the position to Goon's build length.
  const positionMs = goon.isCurrent
    ? Math.min(player.positionMs, goon.programMs)
    : 0;
  const timeScale = goon.isCurrent ? player.timeScale : 1;
  const pct =
    goon.programMs > 0 ? Math.round((positionMs / goon.programMs) * 100) : 0;
  const jumpClass =
    "flex-1 rounded-lg bg-secondary py-3 text-sm font-medium disabled:opacity-40";

  return (
    <section className="flex w-full flex-col gap-4">
      <ListeningFor words={kws.listeningFor} flashing={kws.flashing} />

      <RunButton
        state={goon.state}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        onReset={onReset}
        className="bg-gradient-to-br from-fuchsia-600 to-rose-500"
      />

      <Card>
        <Sparkline points={player.upcoming.speed} valves={player.upcoming.valves} />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>now</span>
          <span>+60s</span>
        </div>
      </Card>

      <StrokeCard
        strokeDisabled={!goon.canStroke}
        actionDisabled={!goon.canEnd}
        strokePulsing={goon.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
        onCumming={goon.cumming}
      />

      <Card title="Timeline">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span className="tabular-nums">{formatMs(positionMs)}</span>
          <span className="tabular-nums">
            {formatMs(goon.programMs)} · {pct}% · {timeScale.toFixed(2)}×
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
            onClick={() => vacuglide.player.back()}
            disabled={!goon.isCurrent}
            className={jumpClass}
            badge="back"
          >
            − 1 min
          </Button>
          <Button
            onClick={() => vacuglide.player.forward()}
            disabled={!goon.isCurrent}
            className={jumpClass}
            badge="forward"
          >
            + 1 min
          </Button>
          <Button
            onClick={() => vacuglide.player.seekTo(goon.programMs)}
            disabled={!goon.isCurrent}
            className={jumpClass}
            badge="finish"
          >
            Finish
          </Button>
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={() => vacuglide.player.slower()}
            disabled={!goon.isCurrent}
            className={jumpClass}
            badge="slower"
          >
            Slower
          </Button>
          <Button
            onClick={() => vacuglide.player.faster()}
            disabled={!goon.isCurrent}
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
          <span className="tabular-nums">{goon.intensity}%</span>
        </div>
        <Slider
          value={goon.intensity}
          min={0}
          max={100}
          step={5}
          onChange={goon.changeIntensity}
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
