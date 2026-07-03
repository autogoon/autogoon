"use client";

// Vacuglide Autopilot panel — presentation only. Device commands come from the
// VacuglideController; the algorithm knobs come from the AutopilotController.
// Both live at the top of the tree so autopilot keeps running while this panel
// is hidden behind another tab.

import { useCallback } from "react";
import { Card } from "@/components/card";
import { HoldButton } from "@/components/hold-button";
import { LogCard } from "@/components/log-card";
import { RunButton } from "@/components/run-button";
import { VoiceCommands } from "@/components/voice-commands";
import type { AutopilotController } from "@/hooks/use-autopilot";
import type { VacuglideController } from "@/hooks/use-vacuglide";

function Segmented<T extends string>({
  options,
  value,
  onChange,
  activeClass,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  activeClass: string;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-3 ${i > 0 ? "border-l" : ""} ${
            value === opt.value ? activeClass : "text-muted-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function AutopilotPanel({
  vacuglide,
  autopilot,
  onStart,
  onStop,
}: {
  vacuglide: VacuglideController;
  autopilot: AutopilotController;
  onStart: () => void;
  onStop: () => void;
}) {
  const words = autopilot.keywords.map((k) => k.word);
  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  return (
    <section className="flex w-full flex-col gap-4">
      <RunButton
        running={autopilot.isPlaying}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        className="bg-linear-to-br from-orange-500 to-pink-500"
      />

      <VoiceCommands words={words} />

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
          <button
            onClick={autopilot.finishMe}
            disabled={!autopilot.isPlaying}
            className="flex-1 rounded-lg bg-linear-to-br from-red-600 to-pink-500 py-3 text-lg font-bold text-white disabled:opacity-40"
          >
            🔥 Finish ME!! 🔥
          </button>
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
