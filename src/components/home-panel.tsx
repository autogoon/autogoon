"use client";

// The home screen — the top of the navigation hierarchy: the device
// token/connection group first (it's the gate to everything else), then the
// algorithm chooser (each entry doubles as that algorithm's voice word,
// wearing its algorithm's accent colour), and the getting-started small print.
// Settings sits beside home as a top-level tab (see page.tsx).

import { ChevronRight, Plug } from "lucide-react";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { Button } from "@/components/button";

export function HomePanel({
  vacuglide,
  algorithms,
  onSelect,
}: {
  vacuglide: VacuglideDeviceController;
  algorithms: ReadonlyArray<{
    id: string;
    label: string;
    description: string;
    accent: string;
  }>;
  onSelect: (id: string) => void;
}) {
  const chooser = (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold">Choose an algorithm</h2>
      {algorithms.map((a) => (
        <Button
          key={a.id}
          onClick={() => onSelect(a.id)}
          badge={a.id}
          className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left ${a.accent}`}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{a.label}</span>
            <span className="text-muted-foreground block text-sm">
              {a.description}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </Button>
      ))}
    </div>
  );

  const device = (
    <div className="space-y-2">
      <h2 className="font-semibold">Device</h2>
      <p className="text-muted-foreground text-sm">
        Enter your Vacuglide device token, then use Connect in the header bar to
        connect via the Autoblow cloud API. The token is saved on this device,
        so next time Autogoon connects automatically.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={vacuglide.token}
          onChange={(e) => vacuglide.setToken(e.target.value)}
          placeholder="Device token"
          spellCheck={false}
          autoComplete="off"
          className="bg-background min-w-0 flex-1 rounded-lg border px-3 py-2"
        />
        <Button
          onClick={() => void vacuglide.connect()}
          disabled={vacuglide.connecting || vacuglide.connected}
          title={vacuglide.deviceStatus}
          className={`bg-card flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${
            vacuglide.connected ? "border-emerald-500 text-emerald-500" : ""
          } ${vacuglide.deviceStatusKind === "error" ? "border-destructive text-destructive" : ""}`}
        >
          <Plug className="size-4" />
          {vacuglide.connected
            ? "Connected"
            : vacuglide.connecting
              ? "Connecting…"
              : "Connect"}
        </Button>
      </div>
      <p
        className={`text-sm ${
          vacuglide.deviceStatusKind === "ok"
            ? "text-emerald-500"
            : vacuglide.deviceStatusKind === "error"
              ? "text-destructive"
              : "text-muted-foreground"
        }`}
      >
        {vacuglide.deviceStatus}
      </p>
    </div>
  );

  return (
    <section className="flex w-full flex-col gap-8">
      {device}
      {chooser}

      <div className="space-y-2">
        <h2 className="font-semibold">Getting started</h2>
        <div className="text-muted-foreground space-y-3 text-sm">
          <p>
            <span className="text-foreground font-medium">Autogoon</span> drives
            your Autoblow Vacuglide stroker by voice — hands-free, from this
            browser tab.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Enter your device token above and connect.</li>
            <li>
              Click <span className="text-foreground">Listen</span> in the
              header to start the mic (allow the microphone if your browser
              asks).
            </li>
            <li>Pick an algorithm.</li>
          </ol>
          <p>
            You can use voice controls for most things — each page explains the
            words it recognises.
          </p>
          <p>
            <span className="text-foreground font-medium">Privacy.</span> Speech
            recognition runs entirely on your machine; only the device control
            traffic leaves it.
          </p>
          <p>
            <span className="text-foreground font-medium">On mobile,</span> keep
            this tab foregrounded and the screen awake — backgrounded or locked
            tabs stop the mic and the timing loop.
          </p>
        </div>
      </div>
    </section>
  );
}
