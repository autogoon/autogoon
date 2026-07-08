"use client";

// Coordinates the (mutually exclusive) algorithms that can drive the device.
// Each algorithm hook produces an Algorithm; this runner knows which one is
// running, and starting one stops any other. Adding a new algorithm is just
// another entry in the array passed in — no other wiring changes.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import type { PlayerState } from "@/lib/program";

// The same word can land twice in quick succession (e.g. repeated within one
// utterance, or across back-to-back results); ignore a repeat within this window.
const REPEAT_MS = 700;

// One spoken word and the algorithm method it invokes. Each algorithm publishes
// its own set; the keyword dispatcher looks a detected word up here and runs it
// (or ignores it if the algorithm doesn't claim that word). start/stop are
// universal and handled by the dispatcher via the runner, so they don't appear
// here.
// One spoken command: the word, whether it is valid *right now*, and what it
// does. `enabled` is the single source of truth for validity — the KWS grammar
// only listens for enabled words, the dispatcher only runs an enabled command,
// and the matching UI control derives its disabled state from the same flag, so
// button and voice can never disagree.
export interface KeywordAction {
  word: string;
  enabled: boolean;
  run: () => void | Promise<void>;
}

export interface Algorithm {
  id: string;
  label: string;
  // The spoken word that selects this algorithm while idle. Kept separate from
  // `label` because it must be a word vosk's model actually knows: the algorithms'
  // own names ("gooning", "vacuglide") are out-of-vocabulary and never recognised,
  // so this uses plain in-dictionary words like "goon" and "autopilot".
  switchWord: string;
  state: PlayerState;
  currentSpeed: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  arm: () => void;
  keywords: KeywordAction[];
}

export function useAlgorithmRunner(
  vacuglide: VacuglideDeviceController,
  algorithms: Algorithm[],
  // Called when a spoken algorithm name selects that algorithm while idle, so
  // the page can bring its tab into view. Switching is locked while running.
  onSwitch?: (id: string) => void,
) {
  // Derived from the engines themselves (the source of truth), so it stays
  // correct even when an algorithm stops itself (e.g. finish, or page hide).
  // A session is "in progress" when it is playing OR paused (state !== "armed").
  // This is what locks the other tabs and narrows the grammar.
  const running = algorithms.find((algo) => algo.state !== "armed") ?? null;

  // The app-level words worth listening for right now — only the ones that would
  // actually do something in the current state. Running → just "stop" (switching
  // is locked). Idle → the state-appropriate global word ("connect" when there's
  // nothing connected, else "start") plus each algorithm's switch word, so you
  // can name an algorithm to select it.
  // The transport words valid right now, by state:
  //   playing → stop (switching locked)
  //   paused  → start (resume) + reset (switching locked, so no switch words)
  //   armed   → connect|start + reset + each algorithm's switch word
  const runState = running?.state ?? "armed";
  const switchWordsKey = algorithms.map((algo) => algo.switchWord).join("\n");
  const globalWords = useMemo(() => {
    if (runState === "playing") return ["stop"];
    if (runState === "paused") return ["start", "reset"];
    const switchWords = switchWordsKey === "" ? [] : switchWordsKey.split("\n");
    // Reset needs no device (it only restores knobs + regenerates the program),
    // and the Reset button is available while disconnected — so keep the voice
    // word available too. Only "start" is gated on a connection.
    if (!vacuglide.connected) return ["connect", "reset", ...switchWords];
    return ["start", "reset", ...switchWords];
  }, [vacuglide.connected, runState, switchWordsKey]);

  const logError = useCallback(
    (err: unknown) =>
      vacuglide.log(`error: ${(err as Error).message}`, "error"),
    [vacuglide],
  );

  // Stop whatever else is running, then start `id`. The device is connected
  // separately (from the header), so callers should ensure that first.
  const run = useCallback(
    async (id: string) => {
      try {
        for (const algo of algorithms) {
          if (algo.id !== id && algo.state !== "armed") await algo.stop();
        }
        const target = algorithms.find((algo) => algo.id === id);
        if (target !== undefined && target.state !== "playing")
          await target.start();
      } catch (err) {
        logError(err);
      }
    },
    [algorithms, logError],
  );

  const stop = useCallback(() => {
    for (const algo of algorithms) {
      if (algo.state === "playing") algo.stop().catch(logError);
    }
  }, [algorithms, logError]);

  const reset = useCallback(
    (id: string) => {
      const target = algorithms.find((algo) => algo.id === id);
      if (target !== undefined && target.state !== "playing") target.reset();
    },
    [algorithms],
  );

  const arm = useCallback(
    (id: string) => {
      // Only arm while nothing is in progress; a paused/playing session must not
      // be re-armed out from under the user (the tab lock enforces this too).
      if (running !== null) return;
      const target = algorithms.find((algo) => algo.id === id);
      target?.arm();
    },
    [algorithms, running],
  );

  // The "current" algorithm: the running one, or the last that ran. A voice
  // "start" from idle (re)starts this, so voice control has a target before
  // anything is playing. Defaults to the first algorithm and follows the last
  // one that ran; the page also points it at the visible tab via setCurrent.
  const currentIdRef = useRef<string | null>(
    running?.id ?? algorithms[0]?.id ?? null,
  );
  const runningId = running?.id ?? null;
  useEffect(() => {
    if (runningId !== null) currentIdRef.current = runningId;
  }, [runningId]);

  // Point "start" at a specific algorithm (e.g. the one whose tab is visible).
  const setCurrent = useCallback((id: string) => {
    currentIdRef.current = id;
  }, []);

  // Latest values reachable from handleWord, which the KWS recognizer may call
  // at any time. Kept in a ref so handleWord itself stays stable.
  const dispatchRef = useRef({
    algorithms,
    run,
    stop,
    reset,
    connect: vacuglide.connect,
    log: vacuglide.log,
    onSwitch,
  });
  dispatchRef.current = {
    algorithms,
    run,
    stop,
    reset,
    connect: vacuglide.connect,
    log: vacuglide.log,
    onSwitch,
  };
  const lastFiredRef = useRef<Map<string, number>>(new Map());

  // Route a detected word. connect/start/stop are app-level and go through the
  // runner; any other word is handed to the running algorithm, which acts on it
  // or ignores it.
  const handleWord = useCallback((word: string) => {
    const { algorithms, run, stop, reset, connect, log, onSwitch } =
      dispatchRef.current;

    let action: (() => void | Promise<void>) | null = null;
    if (word === "connect") {
      action = () => {
        void connect();
      };
    } else if (word === "stop") {
      action = stop;
    } else if (word === "reset") {
      const id = currentIdRef.current;
      if (id !== null) action = () => reset(id);
    } else if (word === "start") {
      const id = currentIdRef.current;
      if (id !== null) action = () => run(id);
    } else {
      const inProgress =
        algorithms.find((algo) => algo.state !== "armed") ?? null;
      if (inProgress !== null) {
        // Something's running/paused: only its own keywords apply (and only the
        // ones enabled right now). Switching is locked.
        action =
          inProgress.keywords.find((k) => k.word === word && k.enabled)?.run ??
          null;
      } else {
        // Armed: an algorithm's switch word selects that algorithm (points
        // "start" at it and brings its tab into view); otherwise the word is the
        // current tab's own keyword, so knobs/scrub work before Start. Switch
        // words (goon/groove/autopilot) never collide with an algorithm's
        // keywords, so trying the switch word first is unambiguous.
        const chosen =
          algorithms.find((algo) => algo.switchWord === word) ?? null;
        if (chosen !== null) {
          action = () => {
            currentIdRef.current = chosen.id;
            onSwitch?.(chosen.id);
          };
        } else {
          const current =
            algorithms.find((algo) => algo.id === currentIdRef.current) ?? null;
          action =
            current?.keywords.find((k) => k.word === word && k.enabled)?.run ??
            null;
        }
      }
    }
    if (action === null) return;

    const now = Date.now();
    if (now - (lastFiredRef.current.get(word) ?? 0) < REPEAT_MS) return;
    lastFiredRef.current.set(word, now);

    log(`🎙 ${word}`, "hit");
    void Promise.resolve(action()).catch((err: Error) =>
      log(`error: ${err.message}`, "error"),
    );
  }, []);

  return { running, run, stop, reset, arm, handleWord, setCurrent, globalWords };
}

export type AlgorithmRunner = ReturnType<typeof useAlgorithmRunner>;
