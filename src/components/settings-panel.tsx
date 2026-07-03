"use client";

// Settings panel — device connection lives here. Connecting is triggered from
// the header bar's Connect button (which uses the token entered here), so this
// panel only holds the token input and the connection status readout.

import type { VacuglideController } from "@/hooks/use-vacuglide";
import { Card } from "@/components/card";
import { ThemeToggle } from "@/components/theme-toggle";

export function SettingsPanel({
  vacuglide,
}: {
  vacuglide: VacuglideController;
}) {
  return (
    <section className="flex w-full flex-col gap-4">
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

      <Card title="Device">
        <p className="text-muted-foreground text-sm">
          Enter your Vacuglide device token, then use Connect in the header bar
          to connect via the Autoblow cloud API.
        </p>
        <input
          type="text"
          value={vacuglide.token}
          onChange={(e) => vacuglide.setToken(e.target.value)}
          placeholder="Device token"
          spellCheck={false}
          autoComplete="off"
          className="bg-background w-full rounded-lg border px-3 py-2"
        />
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
    </section>
  );
}
