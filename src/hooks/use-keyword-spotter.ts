"use client";

// Keyword spotting via vosk-browser with a grammar constrained to a word
// list. Detections fire from partial results (streamed while you speak)
// rather than final results, which only arrive after ~0.5-1s of silence.
//
// This hook owns all KWS state and audio plumbing so it can live at the top
// of the component tree and keep running while the UI tabs around it change.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KaldiRecognizer, Model } from "vosk-browser";

const MODEL_URL = "/vosk-model-small-en-us-0.15.tar.gz";

// vosk-browser's event payloads, structurally typed here to avoid reaching
// into the package's internal type paths.
interface PartialResultMessage {
  result: { partial: string };
}
interface ResultMessage {
  result: { text: string };
}

export function useKeywordSpotter(
  commandWords: string[] = [],
  onDetect?: (word: string) => void,
  onLog?: (text: string) => void,
) {
  const [modelReady, setModelReady] = useState(false);
  const [listening, setListening] = useState(false);
  // True from the moment we start connecting to the mic until we're listening
  // (or the attempt fails), so the UI can disable the toggle meanwhile.
  const [starting, setStarting] = useState(false);
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());

  const modelRef = useRef<Model | null>(null);
  const recognizerRef = useRef<KaldiRecognizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const aliasMapRef = useRef<Record<string, string>>({});
  const seenWordsRef = useRef<string[]>([]);
  const listeningRef = useRef(false);
  // Words the algorithms want in the grammar, the detection handler (the
  // runner's handleWord) and the log sink, kept in refs so the long-lived
  // recognizer callbacks always reach the current values.
  const commandWordsRef = useRef<string[]>(commandWords);
  const onDetectRef = useRef(onDetect);
  const onLogRef = useRef(onLog);

  useEffect(() => {
    commandWordsRef.current = commandWords;
  }, [commandWords]);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  // The grammar is exactly the words the algorithms publish (plus the global
  // connect/start/stop). Each maps to itself so a detection resolves and fires.
  const buildAliasMap = useCallback((): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const w of commandWordsRef.current) map[w] = w;
    return map;
  }, []);

  const fire = useCallback((spelling: string) => {
    const word = aliasMapRef.current[spelling];
    if (word === undefined) return;
    onDetectRef.current?.(word);
    setFlashing((prev) => new Set(prev).add(word));
    setTimeout(() => {
      setFlashing((prev) => {
        const next = new Set(prev);
        next.delete(word);
        return next;
      });
    }, 400);
  }, []);

  const handlePartial = useCallback(
    (partial: string) => {
      const words = partial
        .trim()
        .split(/\s+/)
        .filter((w) => w !== "" && w !== "[unk]");
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word === undefined) continue;
        if (i >= seenWordsRef.current.length) {
          fire(word);
        } else if (seenWordsRef.current[i] !== word && i === words.length - 1) {
          // the decoder revised its last word; report the correction
          fire(word);
        }
      }
      seenWordsRef.current = words;
    },
    [fire],
  );

  const handleFinal = useCallback(
    (text: string) => {
      seenWordsRef.current = [];
      if (text.trim() !== "") onLogRef.current?.(`(final: ${text})`);
    },
    [],
  );

  // Keep latest handlers reachable from the long-lived recognizer callbacks.
  const handlePartialRef = useRef(handlePartial);
  const handleFinalRef = useRef(handleFinal);
  useEffect(() => {
    handlePartialRef.current = handlePartial;
    handleFinalRef.current = handleFinal;
  }, [handlePartial, handleFinal]);

  // Load the model once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { createModel } = await import("vosk-browser");
        const model = await createModel(MODEL_URL);
        if (cancelled) {
          model.terminate();
          return;
        }
        modelRef.current = model;
        setModelReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load KWS model:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      void audioContextRef.current?.close();
      modelRef.current?.terminate();
      modelRef.current = null;
    };
  }, []);

  const createRecognizer = useCallback(() => {
    const model = modelRef.current;
    const audioContext = audioContextRef.current;
    if (model === null || audioContext === null) return;
    const aliasMap = buildAliasMap();
    aliasMapRef.current = aliasMap;
    const grammar = [...new Set([...Object.keys(aliasMap), "[unk]"])];

    recognizerRef.current?.remove();
    const recognizer = new model.KaldiRecognizer(
      audioContext.sampleRate,
      JSON.stringify(grammar),
    );
    recognizer.on("partialresult", (m) => {
      handlePartialRef.current(
        (m as unknown as PartialResultMessage).result.partial,
      );
    });
    recognizer.on("result", (m) => {
      handleFinalRef.current((m as unknown as ResultMessage).result.text);
    });
    recognizerRef.current = recognizer;
    seenWordsRef.current = [];
  }, [buildAliasMap]);

  // Whenever the word set changes while listening (an algorithm started or
  // stopped), rebuild the recognizer so vosk's grammar tracks it. commandWordsRef
  // is updated by the effect above, which runs first as it's declared earlier.
  useEffect(() => {
    if (listeningRef.current) createRecognizer();
  }, [commandWords, createRecognizer]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      });
      mediaStreamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      // Created without a user gesture (auto-start on load), the context can
      // come up suspended; resume it so audio actually flows.
      void audioContext.resume();
      createRecognizer();

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (recognizerRef.current !== null && listeningRef.current) {
          recognizerRef.current.acceptWaveform(e.inputBuffer);
        }
      };
      source.connect(processor);
      processor.connect(audioContext.destination);

      listeningRef.current = true;
      setListening(true);
    } finally {
      setStarting(false);
    }
  }, [createRecognizer]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    void audioContextRef.current?.close();
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    setListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start().catch((err: Error) => {
        console.error("Microphone error:", err);
      });
    }
  }, [listening, start, stop]);

  // Start listening as soon as the model is ready, so the app is live on load
  // without a click. Guarded so it fires only once — a manual stop stays
  // stopped.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!modelReady || autoStartedRef.current) return;
    autoStartedRef.current = true;
    start().catch((err: Error) => {
      console.error("Microphone error:", err);
    });
  }, [modelReady, start]);

  return {
    modelReady,
    listening,
    starting,
    toggleListening,
    // Exactly the words in vosk's current grammar — the source of truth for
    // what the app is listening for.
    listeningFor: commandWords,
    flashing,
  };
}

export type KeywordSpotterController = ReturnType<typeof useKeywordSpotter>;
