"use client";

// Coordinates the (mutually exclusive) algorithms that can drive the device.
// Each algorithm hook produces an Algorithm; this runner knows which one is
// running, and starting one stops any other. Adding a new algorithm is just
// another entry in the array passed in — no other wiring changes.

import { useCallback, useEffect, useRef } from "react";
import type { VacuglideController } from "@/hooks/use-vacuglide";

// A word revised across partial results can arrive twice; ignore a repeat of
// the same word within this window.
const REPEAT_MS = 700;

// One spoken word and the algorithm method it invokes. Each algorithm publishes
// its own set; the keyword dispatcher looks a detected word up here and runs it
// (or ignores it if the algorithm doesn't claim that word). start/stop are
// universal and handled by the dispatcher via the runner, so they don't appear
// here.
export interface KeywordAction {
  word: string;
  run: () => void | Promise<void>;
}

export interface Algorithm {
  id: string;
  label: string;
  isPlaying: boolean;
  currentSpeed: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  keywords: KeywordAction[];
}

// App-level words the runner handles itself (rather than any one algorithm):
// device connect and start/stop. They're part of the KWS grammar but aren't
// shown per-panel.
export const UNIVERSAL_KEYWORDS = ["connect", "start", "stop"];

export function useAlgorithmRunner(
  vacuglide: VacuglideController,
  algorithms: Algorithm[],
) {
  // Derived from the engines themselves (the source of truth), so it stays
  // correct even when an algorithm stops itself (e.g. finish, or page hide).
  const running = algorithms.find((algo) => algo.isPlaying) ?? null;

  const logError = useCallback(
    (err: unknown) => vacuglide.log(`error: ${(err as Error).message}`, "error"),
    [vacuglide],
  );

  // Stop whatever else is running, then start `id`. The device is connected
  // separately (from the header), so callers should ensure that first.
  const run = useCallback(
    async (id: string) => {
      try {
        for (const algo of algorithms) {
          if (algo.id !== id && algo.isPlaying) await algo.stop();
        }
        const target = algorithms.find((algo) => algo.id === id);
        if (target !== undefined && !target.isPlaying) await target.start();
      } catch (err) {
        logError(err);
      }
    },
    [algorithms, logError],
  );

  const stop = useCallback(() => {
    for (const algo of algorithms) {
      if (algo.isPlaying) algo.stop().catch(logError);
    }
  }, [algorithms, logError]);

  // The "current" algorithm: the running one, or the last that ran. A voice
  // "start" from idle (re)starts this, so voice control has a target before
  // anything is playing.
  const currentIdRef = useRef<string | null>(running?.id ?? null);
  const runningId = running?.id ?? null;
  useEffect(() => {
    if (runningId !== null) currentIdRef.current = runningId;
  }, [runningId]);

  // Latest values reachable from handleWord, which the KWS recognizer may call
  // at any time. Kept in a ref so handleWord itself stays stable.
  const dispatchRef = useRef({
    algorithms,
    run,
    stop,
    connect: vacuglide.connect,
    log: vacuglide.log,
  });
  dispatchRef.current = {
    algorithms,
    run,
    stop,
    connect: vacuglide.connect,
    log: vacuglide.log,
  };
  const lastFiredRef = useRef<Map<string, number>>(new Map());

  // Route a detected word. connect/start/stop are app-level and go through the
  // runner; any other word is handed to the running algorithm, which acts on it
  // or ignores it.
  const handleWord = useCallback((word: string) => {
    const { algorithms, run, stop, connect, log } = dispatchRef.current;

    let action: (() => void | Promise<void>) | null = null;
    if (word === "connect") {
      action = () => {
        void connect();
      };
    } else if (word === "stop") {
      action = stop;
    } else if (word === "start") {
      const id = currentIdRef.current;
      if (id !== null) action = () => run(id);
    } else {
      const target = algorithms.find((algo) => algo.isPlaying) ?? null;
      action = target?.keywords.find((k) => k.word === word)?.run ?? null;
    }
    if (action === null) return;

    const now = Date.now();
    if (now - (lastFiredRef.current.get(word) ?? 0) < REPEAT_MS) return;
    lastFiredRef.current.set(word, now);

    log(`🎙 ${word}`, "info");
    void Promise.resolve(action()).catch((err: Error) =>
      log(`error: ${err.message}`, "error"),
    );
  }, []);

  return { running, run, stop, handleWord };
}

export type AlgorithmRunner = ReturnType<typeof useAlgorithmRunner>;
