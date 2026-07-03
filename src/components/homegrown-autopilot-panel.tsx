"use client";

// Homegrown Autopilot algorithm panel — presentation only. The algorithm runs in
// useHomegrownAutopilot at the top of the tree so it keeps going while this panel is
// hidden behind another tab. Mostly boilerplate for now.

import type { HomegrownAutopilotController } from "@/hooks/use-homegrown-autopilot";
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
import { StrokeCard } from "@/components/stroke-card";

export function HomegrownAutopilotPanel({
  vacuglide,
  homegrown,
  kws,
  onStart,
  onStop,
}: {
  vacuglide: VacuglideDeviceController;
  homegrown: HomegrownAutopilotController;
  kws: KeywordSpotterController;
  onStart: () => void;
  onStop: () => void;
}) {
  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  return (
    <section className="flex w-full flex-col gap-4">
      <ListeningFor words={kws.listeningFor} flashing={kws.flashing} />

      <RunButton
        running={homegrown.isPlaying}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        className="bg-gradient-to-br from-blue-600 to-cyan-500"
      />

      <StrokeCard
        disabled={!homegrown.isPlaying}
        strokePulsing={homegrown.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
        onFinish={() => {}}
      />

      <Card title="Speed">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span>Scale</span>
          <span className="tabular-nums">{homegrown.speedPercent}%</span>
        </div>
        <Slider
          value={homegrown.speedPercent}
          min={0}
          max={100}
          step={10}
          onChange={homegrown.changeSpeedPercent}
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
          value={homegrown.variability}
          onChange={homegrown.changeVariability}
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
