"use client";

// The Settings screen — app-level preferences and diagnostics, reached from
// home. Appearance and the build info live here, and future app settings
// should land here too (per-algorithm options belong in that algorithm's
// setup view instead).

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

// Build stamp, baked into the bundle by next.config at build time. On Vercel the
// SHA/ref come from the deploy's commit; locally both read "dev". The build time
// is a fixed ISO instant that we format in the viewer's local timezone — done in
// an effect (client-only) so the server and client renders can't disagree.
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA ?? "dev";
const gitRef = process.env.NEXT_PUBLIC_GIT_REF ?? "dev";
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const shortSha = gitSha === "dev" ? "dev" : gitSha.slice(0, 7);

export function SettingsPanel() {
  // Local-time build stamp, resolved after mount (see the note above).
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  useEffect(() => {
    if (buildTime === "") return;
    setBuiltAt(
      new Date(buildTime).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }, []);

  return (
    <section className="flex w-full flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Appearance</h2>
          <p className="text-muted-foreground text-sm">
            Light, dark, or follow the system.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Info</h2>
        <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums">
          <dt>Commit</dt>
          <dd className="font-mono">
            {gitSha === "dev" ? (
              <span className="text-foreground">dev</span>
            ) : (
              <a
                href={`https://github.com/autogoon/autogoon/commit/${gitSha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                {shortSha}
              </a>
            )}
          </dd>
          <dt>Branch</dt>
          <dd className="text-foreground font-mono">{gitRef}</dd>
          <dt>Built</dt>
          <dd className="text-foreground">{builtAt ?? "…"}</dd>
        </dl>
      </div>
    </section>
  );
}
