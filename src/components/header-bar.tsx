import { Gauge, Mic, MicOff, Plug } from "lucide-react";
import { Button } from "@/components/button";
import { CONTROL_BORDER } from "@/components/controls";
import type { KeywordSpotter } from "@/components/keyword-spotter";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";

// The shared control look (see controls.ts), compacted for the header row
// (py-1.5). No border colour here — each chip picks exactly one below.
const chipClass =
  "flex items-center gap-1.5 rounded-lg border bg-secondary/50 px-3 py-1.5 text-sm disabled:opacity-50";

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
}: {
  kws: KeywordSpotter;
  vacuglide: VacuglideDeviceController;
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
        <div className="mr-auto flex items-center gap-3">
          <span className="font-semibold">Autogoon</span>
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

        <Button
          onClick={kws.toggleListening}
          disabled={!kws.modelReady || kws.starting}
          className={`${chipClass} ${
            kws.listening
              ? "border-emerald-500 text-emerald-500"
              : CONTROL_BORDER
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
        </Button>

        <Button
          onClick={() => void vacuglide.connect()}
          disabled={vacuglide.connecting || vacuglide.connected}
          title={vacuglide.deviceStatus}
          className={`${chipClass} ${
            // Exactly one border colour (see controls.ts): connected wins,
            // then error, then the default control border.
            vacuglide.connected
              ? "border-emerald-500 text-emerald-500"
              : vacuglide.deviceStatusKind === "error"
                ? "border-destructive text-destructive"
                : CONTROL_BORDER
          }`}
        >
          <Plug className="size-4" />
          <span className="hidden sm:inline">
            {vacuglide.connected
              ? "Connected"
              : vacuglide.connecting
                ? "Connecting…"
                : "Connect"}
          </span>
        </Button>
      </div>
    </header>
  );
}
