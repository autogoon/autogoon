"use client";

// The home screen — the top of the navigation hierarchy: the device
// token/connection group first (it's the gate to everything else), then the
// algorithm chooser (each entry doubles as that algorithm's voice word,
// wearing its algorithm's accent colour), and the getting-started small print.
// Settings sits beside home as a top-level tab (see page.tsx).

import { ChevronRight, Plug, type LucideIcon } from "lucide-react";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import {
  CONTROL_BORDER,
  CONTROL_BUTTON_BASE,
  CONTROL_INPUT,
} from "@/components/controls";

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
    // An optional second paragraph shouting about something new on this
    // algorithm.
    highlight?: string;
    icon: LucideIcon;
    iconClass: string;
    accent: string;
  }>;
  onSelect: (id: string) => void;
}) {
  const chooser = (
    <Card title="Choose an algorithm">
      {/* pt-1 is optical: a bordered box carries no line-height slack, so the
          title→border gap needs +4px to match the title→text gap elsewhere. */}
      <div className="flex flex-col gap-3 pt-1">
        {algorithms.map((a) => (
          <Button
            key={a.id}
            onClick={() => onSelect(a.id)}
            badge={a.id}
            className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left ${a.accent}`}
          >
            <a.icon
              className={`size-8 shrink-0 self-start ${a.iconClass}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{a.label}</span>
              <span className="text-muted-foreground block text-sm">
                {a.description}
              </span>
              {a.highlight !== undefined && (
                <span className="mt-1.5 block text-sm">{a.highlight}</span>
              )}
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          </Button>
        ))}
      </div>
    </Card>
  );

  const device = (
    <Card title="Device">
      <p className="text-muted-foreground text-sm">
        Enter your Vacuglide device token, then use Connect in the header bar to
        connect via the Autoblow cloud API. The token is saved on this device,
        so next time Autogoon connects automatically.
      </p>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={vacuglide.token}
          onChange={(e) => vacuglide.setToken(e.target.value)}
          placeholder="Device token"
          spellCheck={false}
          autoComplete="off"
          className={`${CONTROL_INPUT} min-w-0 flex-1`}
        />
        <Button
          onClick={() => void vacuglide.connect()}
          disabled={vacuglide.connecting || vacuglide.connected}
          title={vacuglide.deviceStatus}
          className={`${CONTROL_BUTTON_BASE} flex shrink-0 items-center gap-1.5 ${
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
    </Card>
  );

  return (
    <section className="flex w-full flex-col gap-8">
      {device}
      {chooser}

      <Card title="Getting started">
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
            <span className="text-foreground font-medium">Privacy.</span> For
            the built-in algorithms, speech recognition runs entirely on your
            machine — only the device control traffic leaves it. Companions is
            the exception: it sends your speech and chat to ElevenLabs and
            OpenRouter (see the note on its own screen).
          </p>
          <p>
            <span className="text-foreground font-medium">On mobile,</span> keep
            this tab foregrounded and the screen awake — backgrounded or locked
            tabs stop the mic and the timing loop.
          </p>
        </div>
      </Card>
    </section>
  );
}
