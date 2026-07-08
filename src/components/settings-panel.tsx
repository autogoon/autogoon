"use client";

// Settings panel — device connection lives here. Connecting is triggered from
// the header bar's Connect button (which uses the token entered here), so this
// panel only holds the token input and the connection status readout. It leads
// with a short onboarding intro so a first-run user knows what the app is and
// how to get connected.

import { Plug } from "lucide-react";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ThemeToggle } from "@/components/theme-toggle";

export function SettingsPanel({
  vacuglide,
}: {
  vacuglide: VacuglideDeviceController;
}) {
  return (
    <section className="flex w-full flex-col gap-4">
      <Card title="How Autogoon works">
        <div className="text-muted-foreground space-y-3 text-sm">
          <p>
            <span className="text-foreground font-medium">Autogoon</span> drives
            your Autoblow Vacuglide stroker by voice — hands-free, from this
            browser tab.
          </p>
          <div className="space-y-2">
            <p>
              <span className="text-foreground font-medium">
                Pick an algorithm.
              </span>
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="text-foreground">Goon</span> — an automatic
                30-minute slow build.
              </li>
              <li>
                <span className="text-foreground">Groove</span> — a manual
                pattern you shape live.
              </li>
              <li>
                <span className="text-foreground">Autopilot</span> — recreates
                Vacuglide&rsquo;s own autopilot.
              </li>
            </ul>
            <p>
              Tap its tab — or, while stopped, say{" "}
              <span className="text-foreground">goon</span>,{" "}
              <span className="text-foreground">groove</span>, or{" "}
              <span className="text-foreground">autopilot</span> — to switch;
              once a session is running, switching is locked until you stop.
            </p>
          </div>
          <p>
            <span className="text-foreground font-medium">
              Control it by voice.
            </span>{" "}
            Click <span className="text-foreground">Listen</span> in the header
            to start the mic. <span className="text-foreground">connect</span>,{" "}
            <span className="text-foreground">start</span>, and{" "}
            <span className="text-foreground">stop</span> work everywhere; each
            algorithm adds its own spoken commands, listed on its tab. The first
            time you listen, your browser may ask for permission to use the
            microphone — allow it.
          </p>
          <p>
            <span className="text-foreground font-medium">Get connected.</span>{" "}
            Paste your Vacuglide device token from Autoblow into the{" "}
            <span className="text-foreground">Device</span> card below, then
            press <span className="text-foreground">Connect</span> in the
            header. Your token is saved on this device, so next time you open
            Autogoon it connects automatically — and once you&rsquo;ve allowed
            the microphone, your browser remembers that too.
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
      </Card>

      <Card title="Device">
        <p className="text-muted-foreground text-sm">
          Enter your Vacuglide device token, then use Connect in the header bar
          to connect via the Autoblow cloud API.
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
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Appearance</h2>
            <p className="text-muted-foreground text-sm">
              Light, dark, or follow the system.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Card>
    </section>
  );
}
