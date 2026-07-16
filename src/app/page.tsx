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
import {
  DEFAULT_SAFE_WORD,
  SAFE_WORD_STORAGE_KEY,
  sanitizeSafeWord,
} from "@/lib/safe-word";

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
// An algorithm's setup is its own level (`#goon`), with the live session one
// below (`#goon/play`) — for algorithms that have a setup view (only Goon so
// far; Groove and Autopilot never navigate to a `/play`).
type Screen = "home" | "settings" | AlgorithmId | `${AlgorithmId}/play`;

const isAlgorithmId = (id: string): id is AlgorithmId =>
  ALGORITHMS.some((a) => a.id === id);

// The screen the URL names: `#goon`, `#goon/play`, `#settings`…; no (known)
// hash = home.
const hashScreen = (): Screen => {
  const [base, sub] = window.location.hash.slice(1).split("/");
  if (base !== undefined && isAlgorithmId(base)) {
    return sub === "play" ? `${base}/play` : base;
  }
  return base === "settings" ? "settings" : "home";
};

// One level up: play -> its algorithm's setup, everything else -> home.
const parentOf = (s: Screen): Screen =>
  s.includes("/") ? (s.split("/")[0] as Screen) : "home";

// Words the safe word may not take: everything the grammar already routes
// elsewhere — the global words plus the shared transport words the panels
// declare. One utterance must never mean two things.
const SAFE_WORD_RESERVED = [
  "connect",
  "exit",
  "settings",
  "start",
  "stop",
  "reset",
  ...ALGORITHMS.map((a) => a.id),
];
// The validator the editing surfaces use, with the reserved list baked in.
const sanitizeCandidate = (input: string): string | null =>
  sanitizeSafeWord(input, SAFE_WORD_RESERVED);

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

  // The safe word — the always-on hard stop (see src/lib/safe-word.ts). It
  // lives here, not in the panels, so no algorithm can ever gate it: panels
  // own `stop` and may one day ignore it; the safe word bypasses them and
  // halts the Player directly. Persisted across sessions; the stored value is
  // re-validated on load in case a stale one clashes with words added since.
  const [safeWord, setSafeWordState] = useState(DEFAULT_SAFE_WORD);
  useEffect(() => {
    const stored = localStorage.getItem(SAFE_WORD_STORAGE_KEY);
    if (stored === null) return;
    const word = sanitizeCandidate(stored);
    if (word !== null) setSafeWordState(word);
  }, []);
  // Takes an already-sanitized word (the editing surfaces validate with
  // sanitizeCandidate before calling this).
  const saveSafeWord = useCallback((word: string) => {
    setSafeWordState(word);
    localStorage.setItem(SAFE_WORD_STORAGE_KEY, word);
  }, []);

  // The global grammar slot: connect (while disconnected) everywhere; the
  // algorithm names on home; exit inside an algorithm while nothing runs; the
  // safe word whenever something is playing — exactly where `stop` is live.
  const connected = vacuglide.connected;
  const playing = player.state === "playing";
  useEffect(() => {
    const words: string[] = [];
    if (!connected) words.push("connect");
    if (playing) words.push(safeWord);
    if (screen === "home") {
      words.push(...ALGORITHMS.map((a) => a.id), "settings");
    } else if (!running) {
      words.push("exit");
    }
    setGlobalWords(words);
  }, [connected, running, playing, safeWord, screen, setGlobalWords]);

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
    // A `/play` deep-link is normalized to its setup level — the session it
    // named didn't survive the reload, so re-entering play means re-arming.
    const initial = hashScreen();
    const landing = parentOf(initial) === "home" ? initial : parentOf(initial);
    if (landing !== initial) {
      window.history.replaceState(null, "", `#${landing}`);
    }
    setScreen(landing);
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
  const safeWordRef = useRef(safeWord);
  safeWordRef.current = safeWord;
  const playerRef = useRef(vacuglide.player);
  playerRef.current = vacuglide.player;
  useEffect(() => {
    return keywordListener((word) => {
      // Central log of every recognised command word, so every algorithm's voice
      // hits show up (they used to come from the old runner). Fires alongside the
      // active panel's own handler and the "Listening for" flash — all three ride
      // the same detection.
      logRef.current(`🎙 ${word}`, "hit");
      if (word === safeWordRef.current) {
        // The safe word: halt exactly like Stop, no reset. Routed before (and
        // independently of) everything else; pause() no-ops unless playing, so
        // hearing it outside a session (the test modal) is harmless.
        void playerRef.current.pause();
        return;
      }
      if (word === "connect") {
        void connectRef.current();
        return;
      }
      if (word === "exit" && !runningRef.current) {
        navigate(parentOf(screenRef.current));
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
  // algorithm screens get the breadcrumb instead: Home › Goon (setup), and
  // Home › Goon › Play once a session's been generated.
  const topLevel = screen === "home" || screen === "settings";
  const screenBase = screen.split("/")[0]!;
  const currentAlgorithm = ALGORITHMS.find((a) => a.id === screenBase) ?? null;
  const atPlayLevel = screen.endsWith("/play");
  const crumbLink =
    "text-muted-foreground hover:text-foreground font-medium underline-offset-4 hover:underline disabled:opacity-40";

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
        {currentAlgorithm !== null && (
          // The breadcrumb: the way back up, locked while a session runs (the
          // old tab lock's rule — stop before you leave).
          <nav className="flex items-center gap-2 border-b py-3 text-sm">
            <Button
              onClick={() => navigate("home")}
              disabled={running}
              title={running ? "Stop the session first" : undefined}
              className={crumbLink}
            >
              Home
            </Button>
            <span className="text-muted-foreground">›</span>
            {atPlayLevel ? (
              <>
                <Button
                  onClick={() => navigate(currentAlgorithm.id)}
                  disabled={running}
                  title={running ? "Stop the session first" : undefined}
                  className={crumbLink}
                >
                  {currentAlgorithm.label}
                </Button>
                <span className="text-muted-foreground">›</span>
                <span className="font-medium">Play</span>
              </>
            ) : (
              <span className="font-medium">{currentAlgorithm.label}</span>
            )}
            {!running && (
              <span className="text-muted-foreground ml-auto text-xs">
                Say <code>exit</code> to go back
              </span>
            )}
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
          <div className={screenBase === "goon" ? undefined : "hidden"}>
            <GoonPanel
              vacuglide={vacuglide}
              player={player}
              active={screenBase === "goon"}
              view={atPlayLevel ? "play" : "setup"}
              onEnterPlay={() => navigate("goon/play")}
              safeWord={safeWord}
              sanitizeSafeWord={sanitizeCandidate}
              onSaveSafeWord={saveSafeWord}
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
            <SettingsPanel
              safeWord={safeWord}
              sanitizeSafeWord={sanitizeCandidate}
              onSaveSafeWord={saveSafeWord}
            />
          </div>
        </main>
      </div>
    </>
  );
}
