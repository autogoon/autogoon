"use client";

// Owns the KWS and autopilot controllers (which must keep running regardless
// of which tab is visible) and lays out the header bar, tab bar and panels.
// Hidden tabs stay mounted — only their visibility changes.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { VacuglideAutopilotPanel } from "@/components/vacuglide-autopilot-panel";
import { HeaderBar } from "@/components/header-bar";
import { HomegrownAutopilotPanel } from "@/components/homegrown-autopilot-panel";
import { SettingsPanel } from "@/components/settings-panel";
import {
  useAlgorithmRunner,
  type Algorithm,
} from "@/hooks/use-algorithm-runner";
import { useVacuglideAutopilot } from "@/hooks/use-vacuglide-autopilot";
import { useHomegrownAutopilot } from "@/hooks/use-homegrown-autopilot";
import { useKeywordSpotter } from "@/hooks/use-keyword-spotter";
import {
  getStoredToken,
  useVacuglideDevice,
} from "@/hooks/use-vacuglide-device";

const TABS = [
  { id: "homegrown-autopilot", label: "Homegrown", align: "left" },
  { id: "vacuglide-autopilot", label: "Vacuglide", align: "left" },
  { id: "settings", label: "Settings", align: "right" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const vacuglide = useVacuglideDevice();
  const autopilot = useVacuglideAutopilot(vacuglide);
  const homegrown = useHomegrownAutopilot(vacuglide);
  const [tab, setTab] = useState<TabId>("homegrown-autopilot");

  // With no saved token there's nothing to auto-connect to, so send the user
  // to Settings to enter one. (useVacuglideDevice auto-connects when a token exists.)
  useEffect(() => {
    const stored = getStoredToken();
    if (stored === null || stored.trim() === "") setTab("settings");
  }, []);

  // Every device-driving algorithm, registered with the runner. Adding another
  // algorithm means adding a hook above and one more entry here.
  const algorithms: Algorithm[] = [
    {
      id: "vacuglide-autopilot",
      label: "Vacuglide",
      isPlaying: autopilot.isPlaying,
      currentSpeed: autopilot.currentSpeed,
      start: autopilot.start,
      stop: autopilot.stop,
      keywords: autopilot.keywords,
    },
    {
      id: "homegrown-autopilot",
      label: "Homegrown",
      isPlaying: homegrown.isPlaying,
      currentSpeed: homegrown.currentSpeed,
      start: homegrown.start,
      stop: homegrown.stop,
      keywords: homegrown.keywords,
    },
  ];
  const runner = useAlgorithmRunner(vacuglide, algorithms);

  // The words the KWS grammar should recognise right now: the currently-valid
  // global word (connect/start/stop, per connection + running state), plus the
  // keywords of whichever algorithm is running. This is exactly what gets
  // handed to vosk, and the spotter echoes it back as `listeningFor`.
  const running = runner.running;
  const commandWords = useMemo(
    () => [
      ...new Set([
        ...runner.globalWords,
        ...(running?.keywords ?? []).map((k) => k.word),
      ]),
    ],
    [runner.globalWords, running?.keywords],
  );
  // Point voice "start" at whichever algorithm's tab is visible, so it works
  // from a cold load (before anything has run).
  useEffect(() => {
    if (tab !== "settings") runner.setCurrent(tab);
  }, [tab, runner.setCurrent]);

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
            <Button
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
            </Button>
          ))}
        </nav>
        <main className="py-6">
          <div className={tab === "homegrown-autopilot" ? undefined : "hidden"}>
            <HomegrownAutopilotPanel
              vacuglide={vacuglide}
              homegrown={homegrown}
              kws={kws}
              onStart={() => void runner.run("homegrown-autopilot")}
              onStop={runner.stop}
            />
          </div>
          <div className={tab === "vacuglide-autopilot" ? undefined : "hidden"}>
            <VacuglideAutopilotPanel
              vacuglide={vacuglide}
              autopilot={autopilot}
              kws={kws}
              onStart={() => void runner.run("vacuglide-autopilot")}
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
