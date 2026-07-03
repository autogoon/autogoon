"use client";

// Homegrown Autopilot algorithm panel — presentation only. The algorithm runs in
// useHomegrownAutopilot at the top of the tree so it keeps going while this panel is
// hidden behind another tab. Mostly boilerplate for now.

import type { HomegrownAutopilotController } from "@/hooks/use-homegrown-autopilot";
import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { Card } from "@/components/card";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RunButton } from "@/components/run-button";

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

      <Card title="HomegrownAutopilot">
        <p className="text-muted-foreground text-sm">
          A new algorithm, under construction. For now it just holds the speed
          at 10.
        </p>
      </Card>

      <LogCard title="Command log" entries={vacuglide.logEntries} />
    </section>
  );
}
