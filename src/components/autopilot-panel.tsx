"use client";

// Autopilot panel — presentation only. Device commands come from the
// VacuglideDeviceController; the algorithm knobs come from the AutopilotController.
// Both live at the top of the tree so autopilot keeps running while this panel
// is hidden behind another tab.

import { useCallback } from "react";
import { Card } from "@/components/card";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { RunButton } from "@/components/run-button";
import { Segmented } from "@/components/segmented";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";
import type { AutopilotController } from "@/hooks/use-autopilot";
import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

export function AutopilotPanel({
  vacuglide,
  autopilot,
  kws,
  onStart,
  onStop,
  onReset,
}: {
  vacuglide: VacuglideDeviceController;
  autopilot: AutopilotController;
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
        state={autopilot.state}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        onReset={onReset}
        className="bg-linear-to-br from-orange-500 to-pink-500"
      />

      <Card>
        <Sparkline points={autopilot.upcoming} />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>now</span>
          <span>+60s</span>
        </div>
      </Card>

      <StrokeCard
        strokeDisabled={!autopilot.canStroke}
        actionDisabled={!autopilot.canEnd}
        strokePulsing={autopilot.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
        onFinish={autopilot.finishMe}
      />

      <Card title="Intensity">
        <Segmented
          options={[
            { value: "warmup", label: "Warmup" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
          value={autopilot.intensity}
          onChange={autopilot.changeIntensity}
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
          value={autopilot.edge}
          onChange={autopilot.changeEdge}
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
          value={autopilot.suction}
          onChange={autopilot.changeSuction}
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
