"use client";

// Groove algorithm panel — presentation only. The algorithm runs in
// useGroove at the top of the tree so it keeps going while this panel is
// hidden behind another tab. Mostly boilerplate for now.

import type { GrooveController } from "@/hooks/use-groove";
import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { useCallback } from "react";
import { Card } from "@/components/card";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { RunButton } from "@/components/run-button";
import { Segmented } from "@/components/segmented";
import { Slider } from "@/components/slider";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";

export function GroovePanel({
  vacuglide,
  groove,
  kws,
  onStart,
  onStop,
  onReset,
}: {
  vacuglide: VacuglideDeviceController;
  groove: GrooveController;
  kws: KeywordSpotterController;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  return (
    <section className="flex w-full flex-col gap-4">
      <ListeningFor words={kws.listeningFor} flashing={kws.flashing} />

      <RunButton
        state={groove.state}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        onReset={onReset}
        className="bg-gradient-to-br from-blue-600 to-cyan-500"
      />

      <Card>
        <Sparkline points={groove.upcoming} />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>now</span>
          <span>+60s</span>
        </div>
      </Card>

      <StrokeCard
        disabled={groove.isPlaying === false}
        strokePulsing={groove.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
        onCumming={groove.cumming}
      />

      <Card title="Speed">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span>Scale</span>
          <span className="tabular-nums">{groove.speedPercent}%</span>
        </div>
        <Slider
          value={groove.speedPercent}
          min={0}
          max={100}
          step={5}
          onChange={groove.changeSpeedPercent}
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
          value={groove.variability}
          onChange={groove.changeVariability}
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
