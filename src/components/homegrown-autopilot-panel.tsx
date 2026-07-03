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

      <Card title="Homegrown">
        <p className="text-muted-foreground text-sm">
          A new algorithm, under construction. For now it just holds the speed
          at 10.
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
