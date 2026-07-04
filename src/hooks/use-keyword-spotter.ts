"use client";

// Keyword spotting via vosk-browser with a grammar constrained to a word
// list. Detections fire from final results — the decoder's settled decision
// for an utterance, which arrives after ~0.5-1s of silence — rather than the
// partials it streams and revises while you speak.
//
// This hook owns all KWS state and audio plumbing so it can live at the top
// of the component tree and keep running while the UI tabs around it change.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KaldiRecognizer, Model } from "vosk-browser";

const MODEL_URL = "/vosk-model-small-en-us-0.15.tar.gz";

// vosk-browser's event payloads, structurally typed here to avoid reaching
// into the package's internal type paths.
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

  // Fire on the decoder's settled decision for an utterance. Each word in the
  // final text is a command detection; partials are ignored.
  const handleFinal = useCallback(
    (text: string) => {
      const words = text
        .trim()
        .split(/\s+/)
        .filter((w) => w !== "" && w !== "[unk]");
      for (const word of words) fire(word);
      if (text.trim() !== "") onLogRef.current?.(`(final: ${text})`);
    },
    [fire],
  );

  // Keep the latest handler reachable from the long-lived recognizer callback.
  const handleFinalRef = useRef(handleFinal);
  useEffect(() => {
    handleFinalRef.current = handleFinal;
  }, [handleFinal]);

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
    recognizer.on("result", (m) => {
      handleFinalRef.current((m as unknown as ResultMessage).result.text);
    });
    recognizerRef.current = recognizer;
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

      await audioContext.audioWorklet.addModule("/kws-audio-worklet.js");
      const source = audioContext.createMediaStreamSource(stream);
      const capture = new AudioWorkletNode(audioContext, "kws-capture");
      capture.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (recognizerRef.current !== null && listeningRef.current) {
          recognizerRef.current.acceptWaveformFloat(
            e.data,
            audioContext.sampleRate,
          );
        }
      };
      source.connect(capture);
      // The worklet emits silence, but it must reach the destination to be
      // pulled by the audio graph.
      capture.connect(audioContext.destination);

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
