"use client";

// Owns the KWS and autopilot controllers (which must keep running regardless
// of which tab is visible) and lays out the header bar, tab bar and panels.
// Hidden tabs stay mounted — only their visibility changes.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { AutopilotPanel } from "@/components/autopilot-panel";
import { HeaderBar } from "@/components/header-bar";
import { GroovePanel } from "@/components/groove-panel";
import { GoonPanel } from "@/components/goon-panel";
import { SettingsPanel } from "@/components/settings-panel";
import {
  useAlgorithmRunner,
  type Algorithm,
} from "@/hooks/use-algorithm-runner";
import { useAutopilot } from "@/hooks/use-autopilot";
import { useGroove } from "@/hooks/use-groove";
import { useGoon } from "@/hooks/use-goon";
import { useKeywordSpotter } from "@/hooks/use-keyword-spotter";
import {
  getStoredToken,
  useVacuglideDevice,
} from "@/hooks/use-vacuglide-device";

const TABS = [
  { id: "goon", label: "Goon", align: "left" },
  { id: "groove", label: "Groove", align: "left" },
  { id: "autopilot", label: "Autopilot", align: "left" },
  { id: "settings", label: "Settings", align: "right" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const vacuglide = useVacuglideDevice();
  const autopilot = useAutopilot(vacuglide);
  const groove = useGroove(vacuglide);
  const goon = useGoon(vacuglide);
  const [tab, setTab] = useState<TabId>("goon");

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
      id: "goon",
      label: "Goon",
      switchWord: "goon",
      state: goon.state,
      currentSpeed: goon.currentSpeed,
      start: goon.start,
      stop: goon.stop,
      reset: goon.reset,
      arm: goon.arm,
      keywords: goon.keywords,
    },
    {
      id: "autopilot",
      label: "Autopilot",
      switchWord: "autopilot",
      state: autopilot.state,
      currentSpeed: autopilot.currentSpeed,
      start: autopilot.start,
      stop: autopilot.stop,
      reset: autopilot.reset,
      arm: autopilot.arm,
      keywords: autopilot.keywords,
    },
    {
      id: "groove",
      label: "Groove",
      switchWord: "groove",
      state: groove.state,
      currentSpeed: groove.currentSpeed,
      start: groove.start,
      stop: groove.stop,
      reset: groove.reset,
      arm: groove.arm,
      keywords: groove.keywords,
    },
  ];
  const runner = useAlgorithmRunner(vacuglide, algorithms, (id) =>
    setTab(id as TabId),
  );

  // The words the KWS grammar should recognise right now: the currently-valid
  // global word (connect/start/stop, per connection + running state), plus the
  // keywords of whichever algorithm is running. This is exactly what gets
  // handed to vosk, and the spotter echoes it back as `listeningFor`.
  const running = runner.running;
  const activeAlgo = running ?? algorithms.find((a) => a.id === tab) ?? null;
  const commandWords = useMemo(
    () => [
      ...new Set([
        ...runner.globalWords,
        ...(activeAlgo?.keywords ?? [])
          .filter((k) => k.enabled)
          .map((k) => k.word),
      ]),
    ],
    [runner.globalWords, activeAlgo?.keywords],
  );
  // Point voice "start" at whichever algorithm's tab is visible, so it works
  // from a cold load (before anything has run). Also arm the visible algorithm
  // tab so its preview is built — runner.arm no-ops while a session is running.
  const runningId = runner.running?.id ?? null;
  useEffect(() => {
    if (tab === "settings") return;
    runner.setCurrent(tab);
    if (runningId === null) runner.arm(tab);
  }, [tab, runningId, runner]);

  // KWS calls the runner directly with each detected word, and logs its final
  // transcripts into the shared command log (the runner logs each executed word
  // it acts on).
  const kws = useKeywordSpotter(commandWords, runner.handleWord, vacuglide.log);

  return (
    <>
      <HeaderBar kws={kws} vacuglide={vacuglide} />
      <div className="mx-auto w-full max-w-2xl px-4">
        <nav className="flex gap-6 border-b">
          {TABS.map((t) => {
            // While an algorithm runs, lock the other algorithm tabs — you can't
            // switch algorithms mid-session. The running one's own tab (to view
            // it) and Settings stay reachable.
            const locked =
              runner.running !== null &&
              t.id !== "settings" &&
              t.id !== runner.running.id;
            return (
              <Button
                key={t.id}
                onClick={() => setTab(t.id)}
                disabled={locked}
                className={`-mb-px border-b-2 py-3 text-sm font-medium disabled:pointer-events-none disabled:opacity-40 ${
                  t.align === "right" ? "ml-auto" : ""
                } ${
                  tab === t.id
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {t.label}
              </Button>
            );
          })}
        </nav>
        <main className="py-6">
          <div className={tab === "goon" ? undefined : "hidden"}>
            <GoonPanel
              vacuglide={vacuglide}
              goon={goon}
              kws={kws}
              onStart={() => void runner.run("goon")}
              onStop={runner.stop}
              onReset={() => runner.reset("goon")}
            />
          </div>
          <div className={tab === "groove" ? undefined : "hidden"}>
            <GroovePanel
              vacuglide={vacuglide}
              groove={groove}
              kws={kws}
              onStart={() => void runner.run("groove")}
              onStop={runner.stop}
              onReset={() => runner.reset("groove")}
            />
          </div>
          <div className={tab === "autopilot" ? undefined : "hidden"}>
            <AutopilotPanel
              vacuglide={vacuglide}
              autopilot={autopilot}
              kws={kws}
              onStart={() => void runner.run("autopilot")}
              onStop={runner.stop}
              onReset={() => runner.reset("autopilot")}
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
