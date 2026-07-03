"use client";

// Vacuglide Autopilot panel — presentation only. Device commands come from the
// VacuglideDeviceController; the algorithm knobs come from the VacuglideAutopilotController.
// Both live at the top of the tree so autopilot keeps running while this panel
// is hidden behind another tab.

import { useCallback } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { HoldButton } from "@/components/hold-button";
import { ListeningFor } from "@/components/listening-for";
import { LogCard } from "@/components/log-card";
import { RunButton } from "@/components/run-button";
import { Segmented } from "@/components/segmented";
import type { VacuglideAutopilotController } from "@/hooks/use-vacuglide-autopilot";
import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

export function VacuglideAutopilotPanel({
  vacuglide,
  autopilot,
  kws,
  onStart,
  onStop,
}: {
  vacuglide: VacuglideDeviceController;
  autopilot: VacuglideAutopilotController;
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
        running={autopilot.isPlaying}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        className="bg-linear-to-br from-orange-500 to-pink-500"
      />

      <Card title="Manual Override">
        <div className="flex gap-3">
          <HoldButton
            label="Stroke −"
            disabled={!autopilot.isPlaying}
            onValve={vacuglide.valveMinus}
            onError={logError}
            forcedActive={autopilot.strokePulsing === "minus"}
          />
          <HoldButton
            label="Stroke +"
            disabled={!autopilot.isPlaying}
            onValve={vacuglide.valvePlus}
            onError={logError}
            forcedActive={autopilot.strokePulsing === "plus"}
          />
          <Button
            onClick={autopilot.finishMe}
            disabled={!autopilot.isPlaying}
            className="flex-1 rounded-lg bg-linear-to-br from-red-600 to-pink-500 py-3 text-lg font-bold text-white disabled:opacity-40"
            badge="finish"
          >
            Finish
          </Button>
        </div>
      </Card>

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
      </Card>

      <Card title="Edge Control">
        <Segmented
          options={[
            { value: "gentle", label: "Gentle" },
            { value: "moderate", label: "Moderate" },
            { value: "intense", label: "Intense" },
          ]}
          value={autopilot.edge}
          onChange={autopilot.changeEdge}
          activeClass="bg-orange-500 text-white"
        />
      </Card>

      <Card title="Vacuum Maintenance">
        <Segmented
          options={[
            { value: "off", label: "Off" },
            { value: "little", label: "Low" },
            { value: "more", label: "High" },
          ]}
          value={autopilot.suction}
          onChange={autopilot.changeSuction}
          activeClass="bg-cyan-600 text-white"
        />
      </Card>

      <LogCard title="Command log" entries={vacuglide.logEntries} />
    </section>
  );
}
