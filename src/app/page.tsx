"use client";

// Wires the app together and lays out the header, tab bar and panels. The heavy
// lifting lives elsewhere: each algorithm is one self-contained file that owns
// its engine + panel + commands, the Player (in useVacuglideDevice) plays one
// engine at a time, and the KeywordSpotterProvider owns the single recognizer.
// This file only holds the tab state and the two genuinely global concerns:
// which words are live (connect + the algorithm switch words) and routing them.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { AutopilotPanel } from "@/components/algorithms/autopilot-panel";
import { GroovePanel } from "@/components/algorithms/groove-panel";
import { GoonPanel } from "@/components/algorithms/goon-panel";
import { HeaderBar } from "@/components/header-bar";
import { SettingsPanel } from "@/components/settings-panel";
import {
  KeywordSpotterProvider,
  useKeywordSpotter,
} from "@/components/keyword-spotter";
import { usePlayer } from "@/hooks/use-player";
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

// The algorithm tabs, whose names are also the voice "switch" words that select
// them while idle.
const ALGORITHM_TABS = ["goon", "groove", "autopilot"] as const;
type AlgorithmTab = (typeof ALGORITHM_TABS)[number];

const isAlgorithmTab = (id: string): id is AlgorithmTab =>
  (ALGORITHM_TABS as readonly string[]).includes(id);

export default function Home() {
  return (
    <KeywordSpotterProvider>
      <App />
    </KeywordSpotterProvider>
  );
}

function App() {
  const vacuglide = useVacuglideDevice();
  const player = usePlayer(vacuglide.player);
  const spotter = useKeywordSpotter();
  // Only the spotter's stable functions may be used in effect deps — the context
  // object's identity churns with grammar/flash state (see useVoiceCommands).
  const { setGlobalWords, keywordListener } = spotter;
  const [tab, setTab] = useState<TabId>("goon");

  // With no saved token there's nothing to auto-connect to, so send the user to
  // Settings. (useVacuglideDevice auto-connects when a token exists.)
  useEffect(() => {
    const stored = getStoredToken();
    if (stored === null || stored.trim() === "") setTab("settings");
  }, []);

  // A session is in progress whenever the Player is not idle. The running
  // algorithm is captured at the moment play begins (you can only Start from an
  // algorithm's own tab), so the tab lock has a stable reference even if you
  // wander over to Settings mid-session.
  const running = player.state !== "armed";
  const [runningTab, setRunningTab] = useState<AlgorithmTab | null>(null);
  const prevRunning = useRef(false);
  useEffect(() => {
    if (running && !prevRunning.current && isAlgorithmTab(tab)) {
      setRunningTab(tab);
    }
    if (!running) setRunningTab(null);
    prevRunning.current = running;
  }, [running, tab]);

  // The global grammar slot: connect (while disconnected) + the switch words
  // (while idle, so you can name an algorithm to bring its tab up).
  const connected = vacuglide.connected;
  useEffect(() => {
    const words: string[] = [];
    if (!connected) words.push("connect");
    if (!running) words.push(...ALGORITHM_TABS);
    setGlobalWords(words);
  }, [connected, running, setGlobalWords]);

  // Route the global words. connect drives the device; a switch word (while
  // idle) brings that algorithm's tab up. Everything else is an algorithm word,
  // owned and handled by the active panel. connect + running are read through
  // refs so this listener subscribes once, not on every render.
  const runningRef = useRef(running);
  runningRef.current = running;
  const connectRef = useRef(vacuglide.connect);
  connectRef.current = vacuglide.connect;
  const logRef = useRef(vacuglide.log);
  logRef.current = vacuglide.log;
  useEffect(() => {
    return keywordListener((word) => {
      // Central log of every recognised command word, so every algorithm's voice
      // hits show up (they used to come from the old runner). Fires alongside the
      // active panel's own handler and the "Listening for" flash — all three ride
      // the same detection.
      logRef.current(`🎙 ${word}`, "hit");
      if (word === "connect") {
        void connectRef.current();
        return;
      }
      if (isAlgorithmTab(word) && !runningRef.current) setTab(word);
    });
  }, [keywordListener]);

  return (
    <>
      <HeaderBar kws={spotter} vacuglide={vacuglide} />
      <div className="mx-auto w-full max-w-2xl px-4">
        <nav className="flex gap-6 border-b">
          {TABS.map((t) => {
            // While a session runs, lock the other algorithm tabs — you can't
            // switch algorithms mid-session. The running one's own tab and
            // Settings stay reachable.
            const locked =
              runningTab !== null && t.id !== "settings" && t.id !== runningTab;
            return (
              <Button
                key={t.id}
                flash={false}
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
              player={player}
              active={tab === "goon" || runningTab === "goon"}
            />
          </div>
          <div className={tab === "groove" ? undefined : "hidden"}>
            <GroovePanel
              vacuglide={vacuglide}
              player={player}
              active={tab === "groove" || runningTab === "groove"}
            />
          </div>
          <div className={tab === "autopilot" ? undefined : "hidden"}>
            <AutopilotPanel
              vacuglide={vacuglide}
              player={player}
              active={tab === "autopilot" || runningTab === "autopilot"}
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
