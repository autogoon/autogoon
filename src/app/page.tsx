"use client";

// Wires the app together and lays out the header, navigation and screens. The
// heavy lifting lives elsewhere: each algorithm is one self-contained module
// that owns its engine + panel + commands, the Player (in useVacuglideDevice)
// plays one engine at a time, and the KeywordSpotterProvider owns the single
// recognizer. This file only holds the navigation state and the two genuinely
// global concerns: which words are live and routing them.
//
// Navigation is a two-level hierarchy, not tabs: **home** (the algorithm
// chooser, plus the device/appearance cards) and one screen per algorithm.
// You never move sideways between algorithms — home's words are the algorithm
// names, an algorithm screen's word is `exit` (back up), and exit is locked
// while a session runs, so the grammar always matches the visible screen and
// the illegal mid-session switch simply cannot be said or tapped.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { AutopilotPanel } from "@/components/algorithms/autopilot-panel";
import { GroovePanel } from "@/components/algorithms/groove-panel";
import { GoonPanel } from "@/components/algorithms/goon-panel";
import { HeaderBar } from "@/components/header-bar";
import { HomePanel } from "@/components/home-panel";
import { SettingsPanel } from "@/components/settings-panel";
import {
  KeywordSpotterProvider,
  useKeywordSpotter,
} from "@/components/keyword-spotter";
import { usePlayer } from "@/hooks/use-player";
import { useVacuglideDevice } from "@/hooks/use-vacuglide-device";

// The algorithm registry: each entry is a home-page listing (label +
// description + accent), a screen, and a voice word (the id, live on home) all
// at once. Adding a mode is an entry here plus its panel rendered below — the
// switch word and screen follow automatically and the lists can never drift.
// The accent is the algorithm's signature gradient pair (the same one its
// panel's Start button wears), as a border so the entries read at a glance.
const ALGORITHMS = [
  {
    id: "goon",
    label: "Goon",
    description:
      "An automatic slow build over a session length you choose — deep, ragged dips that gradually settle into a steady hold at the top.",
    accent: "border-fuchsia-500 bg-fuchsia-500/10 hover:bg-fuchsia-500/20",
  },
  {
    id: "groove",
    label: "Groove",
    description:
      "A manual stroke pattern you shape live — intensity plus dip and timing variability.",
    accent: "border-blue-500 bg-blue-500/10 hover:bg-blue-500/20",
  },
  {
    id: "autopilot",
    label: "Autopilot",
    description: "A faithful recreation of the Vacuglide's own autopilot.",
    accent: "border-orange-500 bg-orange-500/10 hover:bg-orange-500/20",
  },
] as const;

type AlgorithmId = (typeof ALGORITHMS)[number]["id"];
type Screen = "home" | "settings" | AlgorithmId;

const isAlgorithmId = (id: string): id is AlgorithmId =>
  ALGORITHMS.some((a) => a.id === id);

// The screen the URL names: `#goon` / `#settings` etc.; no (known) hash = home.
const hashScreen = (): Screen => {
  const h = window.location.hash.slice(1);
  return isAlgorithmId(h) || h === "settings" ? h : "home";
};

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
  const [screen, setScreen] = useState<Screen>("home");

  // A session is in progress whenever the Player is not idle. You can only
  // start one from its algorithm's screen and you can't leave while it runs
  // (exit is locked below), so the running algorithm is always exactly the
  // screen you're on — no separate tracking needed.
  const running = player.state !== "armed";

  // The global grammar slot: connect (while disconnected) everywhere; the
  // algorithm names on home; exit inside an algorithm while nothing runs.
  const connected = vacuglide.connected;
  useEffect(() => {
    const words: string[] = [];
    if (!connected) words.push("connect");
    if (screen === "home") {
      words.push(...ALGORITHMS.map((a) => a.id), "settings");
    } else if (!running) {
      words.push("exit");
    }
    setGlobalWords(words);
  }, [connected, running, screen, setGlobalWords]);

  const runningRef = useRef(running);
  runningRef.current = running;
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // Screen ↔ URL: entering a screen pushes `#<id>`, so the browser back button,
  // reloads and deep-links all behave as expected. popstate syncs state from
  // the hash — unless a session runs, in which case the consumed entry is
  // pushed straight back: the browser's back button can't leave mid-session
  // any more than exit can.
  const navigate = useCallback((next: Screen) => {
    setScreen(next);
    window.history.pushState(
      null,
      "",
      next === "home" ? window.location.pathname : `#${next}`,
    );
  }, []);
  useEffect(() => {
    // Land wherever the URL points (reload / deep-link); plain loads read home.
    setScreen(hashScreen());
    const onPop = () => {
      if (runningRef.current) {
        window.history.pushState(null, "", `#${screenRef.current}`);
        return;
      }
      setScreen(hashScreen());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Route the global words. connect drives the device; an algorithm name (on
  // home) enters that algorithm; exit (while idle) goes back up. Everything
  // else is an algorithm word, owned and handled by the active panel. State is
  // read through refs so this listener subscribes once, not on every render.
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
      if (word === "exit" && !runningRef.current) {
        navigate("home");
        return;
      }
      if (
        (isAlgorithmId(word) || word === "settings") &&
        screenRef.current === "home"
      ) {
        navigate(word);
      }
    });
  }, [keywordListener, navigate]);

  // Top level = home + its Settings sibling, shown as the old tab strip;
  // algorithm screens get the breadcrumb instead.
  const topLevel = screen === "home" || screen === "settings";
  const currentLabel = ALGORITHMS.find((a) => a.id === screen)?.label ?? null;

  return (
    <>
      <HeaderBar kws={spotter} vacuglide={vacuglide} />
      <div className="mx-auto w-full max-w-2xl px-4">
        {topLevel && (
          <nav className="flex gap-6 border-b">
            {(
              [
                { id: "home", label: "Home", align: "left" },
                { id: "settings", label: "Settings", align: "right" },
              ] as const
            ).map((t) => (
              <Button
                key={t.id}
                flash={false}
                onClick={() => navigate(t.id)}
                className={`-mb-px border-b-2 py-3 text-sm font-medium ${
                  t.align === "right" ? "ml-auto" : ""
                } ${
                  screen === t.id
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {t.label}
              </Button>
            ))}
          </nav>
        )}
        {currentLabel !== null && (
          // The breadcrumb: the way back up, locked while a session runs (the
          // old tab lock's rule — stop before you leave).
          <nav className="flex items-center gap-2 border-b py-2 text-sm">
            <Button
              onClick={() => navigate("home")}
              disabled={running}
              title={running ? "Stop the session first" : undefined}
              badge="exit"
              className="text-muted-foreground hover:text-foreground bg-card rounded-lg border px-3 py-1.5 font-medium disabled:opacity-40"
            >
              ‹ Home
            </Button>
            <span className="text-muted-foreground">›</span>
            <span className="font-medium">{currentLabel}</span>
          </nav>
        )}
        <main className="py-6">
          <div className={screen === "home" ? undefined : "hidden"}>
            <HomePanel
              vacuglide={vacuglide}
              algorithms={ALGORITHMS}
              onSelect={(id) => {
                if (isAlgorithmId(id) || id === "settings") navigate(id);
              }}
            />
          </div>
          <div className={screen === "goon" ? undefined : "hidden"}>
            <GoonPanel
              vacuglide={vacuglide}
              player={player}
              active={screen === "goon"}
            />
          </div>
          <div className={screen === "groove" ? undefined : "hidden"}>
            <GroovePanel
              vacuglide={vacuglide}
              player={player}
              active={screen === "groove"}
            />
          </div>
          <div className={screen === "autopilot" ? undefined : "hidden"}>
            <AutopilotPanel
              vacuglide={vacuglide}
              player={player}
              active={screen === "autopilot"}
            />
          </div>
          <div className={screen === "settings" ? undefined : "hidden"}>
            <SettingsPanel />
          </div>
        </main>
      </div>
    </>
  );
}
