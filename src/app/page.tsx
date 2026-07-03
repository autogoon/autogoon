"use client";

// Owns the KWS and autopilot controllers (which must keep running regardless
// of which tab is visible) and lays out the header bar, tab bar and panels.
// Hidden tabs stay mounted — only their visibility changes.

import { useEffect, useMemo, useState } from "react";
import { AutopilotPanel } from "@/components/autopilot-panel";
import { HeaderBar } from "@/components/header-bar";
import { HomegrownPanel } from "@/components/homegrown-panel";
import { SettingsPanel } from "@/components/settings-panel";
import {
  UNIVERSAL_KEYWORDS,
  useAlgorithmRunner,
  type Algorithm,
} from "@/hooks/use-algorithm-runner";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useHomegrown } from "@/hooks/use-homegrown";
import { useKeywordSpotter } from "@/hooks/use-keyword-spotter";
import { getStoredToken, useVacuglide } from "@/hooks/use-vacuglide";

const TABS = [
  { id: "autopilot", label: "Vacuglide", align: "left" },
  { id: "homegrown", label: "Homegrown", align: "left" },
  { id: "settings", label: "Settings", align: "right" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const vacuglide = useVacuglide();
  const autopilot = useAutopilot(vacuglide);
  const homegrown = useHomegrown(vacuglide);
  const [tab, setTab] = useState<TabId>("autopilot");

  // With no saved token there's nothing to auto-connect to, so send the user
  // to Settings to enter one. (useVacuglide auto-connects when a token exists.)
  useEffect(() => {
    const stored = getStoredToken();
    if (stored === null || stored.trim() === "") setTab("settings");
  }, []);

  // Every device-driving algorithm, registered with the runner. Adding another
  // algorithm means adding a hook above and one more entry here.
  const algorithms: Algorithm[] = [
    {
      id: "autopilot",
      label: "Vacuglide",
      isPlaying: autopilot.isPlaying,
      currentSpeed: autopilot.currentSpeed,
      start: autopilot.start,
      stop: autopilot.stop,
      keywords: autopilot.keywords,
    },
    {
      id: "homegrown",
      label: "Homegrown",
      isPlaying: homegrown.isPlaying,
      currentSpeed: homegrown.currentSpeed,
      start: homegrown.start,
      stop: homegrown.stop,
      keywords: homegrown.keywords,
    },
  ];
  const runner = useAlgorithmRunner(vacuglide, algorithms);

  // The words the KWS grammar should recognise right now: the global
  // connect/start/stop, plus the keywords of whichever algorithm is running
  // (none → just the globals). This is exactly what gets handed to vosk, and
  // the spotter echoes it back as `listeningFor` for the panel to display.
  const running = runner.running;
  const commandWords = useMemo(
    () => [
      ...new Set([
        ...UNIVERSAL_KEYWORDS,
        ...(running?.keywords ?? []).map((k) => k.word),
      ]),
    ],
    [running?.keywords],
  );
  // KWS calls the runner directly with each detected word, and logs its final
  // transcripts into the shared command log (the runner logs the executed
  // partial hits).
  const kws = useKeywordSpotter(commandWords, runner.handleWord, vacuglide.log);

  return (
    <>
      <HeaderBar
        kws={kws}
        vacuglide={vacuglide}
        running={runner.running}
        onStop={runner.stop}
      />
      <div className="mx-auto w-full max-w-2xl px-4">
        <nav className="flex gap-6 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 py-3 text-sm font-medium ${
                t.align === "right" ? "ml-auto" : ""
              } ${
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <main className="py-6">
          <div className={tab === "autopilot" ? undefined : "hidden"}>
            <AutopilotPanel
              vacuglide={vacuglide}
              autopilot={autopilot}
              kws={kws}
              onStart={() => void runner.run("autopilot")}
              onStop={runner.stop}
            />
          </div>
          <div className={tab === "homegrown" ? undefined : "hidden"}>
            <HomegrownPanel
              vacuglide={vacuglide}
              homegrown={homegrown}
              kws={kws}
              onStart={() => void runner.run("homegrown")}
              onStop={runner.stop}
            />
          </div>
          <div className={tab === "settings" ? undefined : "hidden"}>
            <SettingsPanel vacuglide={vacuglide} />
          </div>
        </main>
      </div>
    </>
  );
}
