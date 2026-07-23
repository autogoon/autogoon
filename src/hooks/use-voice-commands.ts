"use client";

// The bridge between a panel's commands and the shared keyword spotter. A
// command is declared ONCE (word + enabled + run); the panel renders a button
// from it AND this hook registers the word for voice — so button and voice hit
// the same handler and share the same `enabled`, and can never disagree.
//
// Only the active panel registers, so exactly one play mode's words are ever in
// the grammar at a time.

import { useEffect, useRef } from "react";
import { useKeywordSpotter } from "@/components/keyword-spotter";

export interface Command {
  word: string;
  enabled: boolean;
  run: () => void | Promise<void>;
}

export function useVoiceCommands(active: boolean, commands: Command[]): void {
  // Depend only on the spotter's STABLE functions — never the context object
  // itself. Its identity changes whenever the grammar or flash state changes, so
  // an effect keyed on the whole object would re-run (and, since the cleanup
  // clears the words, oscillate) on every publish.
  const { setPlayModeKeywords, keywordListener } = useKeywordSpotter();

  // Latest commands reachable from the (stable) detection listener.
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  // Publish the enabled words while active; clear them when we stop being active.
  const wordsKey = commands
    .filter((c) => c.enabled)
    .map((c) => c.word)
    .join("\n");
  useEffect(() => {
    if (!active) return;
    setPlayModeKeywords(wordsKey === "" ? [] : wordsKey.split("\n"));
    return () => setPlayModeKeywords([]);
  }, [active, wordsKey, setPlayModeKeywords]);

  // Route detections to the matching enabled command while active.
  useEffect(() => {
    if (!active) return;
    return keywordListener((word) => {
      const cmd = commandsRef.current.find((c) => c.word === word && c.enabled);
      void cmd?.run();
    });
  }, [active, keywordListener]);
}
