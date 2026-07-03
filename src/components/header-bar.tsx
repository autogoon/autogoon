"use client";

import { Gauge, Mic, MicOff, Plug, Square } from "lucide-react";
import type { Algorithm } from "@/hooks/use-algorithm-runner";
import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

const chipClass =
  "flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm disabled:opacity-40";

function ValvePill({ label, open }: { label: string; open: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${
        open
          ? "border border-cyan-500 bg-cyan-500/15 text-cyan-500"
          : "text-muted-foreground/50 border border-transparent"
      }`}
    >
      {label}
    </span>
  );
}

export function HeaderBar({
  kws,
  vacuglide,
  running,
  onStop,
}: {
  kws: KeywordSpotterController;
  vacuglide: VacuglideDeviceController;
  running: Algorithm | null;
  onStop: () => void;
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
        <div className="mr-auto flex items-center gap-3">
          <span className="font-semibold">Fun</span>
          {vacuglide.connected && (
            <div className="flex items-center gap-1.5">
              <span
                className="text-muted-foreground flex items-center gap-1 text-sm tabular-nums"
                title="Current target speed"
              >
                <Gauge className="size-4" />
                {vacuglide.deviceSpeed}%
              </span>
              <ValvePill label="S+" open={vacuglide.strokePlusValve} />
              <ValvePill label="S−" open={vacuglide.strokeMinusValve} />
            </div>
          )}
        </div>

        <button
          onClick={kws.toggleListening}
          disabled={!kws.modelReady || kws.starting}
          className={`${chipClass} ${
            kws.listening ? "border-emerald-500 text-emerald-500" : ""
          }`}
        >
          {kws.listening ? (
            <Mic className="size-4" />
          ) : (
            <MicOff className="size-4" />
          )}
          <span className="hidden sm:inline">
            {kws.starting === true
              ? "Starting…"
              : kws.listening === true
                ? "Listening"
                : "Listen"}
          </span>
        </button>

        <button
          onClick={() => void vacuglide.connect()}
          disabled={vacuglide.connecting || vacuglide.connected}
          title={vacuglide.deviceStatus}
          className={`${chipClass} ${
            vacuglide.connected ? "border-emerald-500 text-emerald-500" : ""
          } ${vacuglide.deviceStatusKind === "error" ? "border-destructive text-destructive" : ""}`}
        >
          <Plug className="size-4" />
          <span className="hidden sm:inline">
            {vacuglide.connected
              ? "Connected"
              : vacuglide.connecting
                ? "Connecting…"
                : "Connect"}
          </span>
        </button>

        {running !== null && (
          <button
            onClick={onStop}
            title={`Stop ${running.label}`}
            className={`${chipClass} border-red-500 text-red-500`}
          >
            <Square className="size-4 fill-current" />
            <span className="hidden sm:inline">Stop</span>
          </button>
        )}
      </div>
    </header>
  );
}
