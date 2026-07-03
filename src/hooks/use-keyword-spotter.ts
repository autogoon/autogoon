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

// Each entry is one keyword; alternate spellings joined with "/" are treated
// as the same keyword (first spelling is the display name).
const DEFAULT_WORDS = "slower faster valve up down stop woah/whoa";

// vosk-browser's event payloads, structurally typed here to avoid reaching
// into the package's internal type paths.
interface PartialResultMessage {
  result: { partial: string };
}
interface ResultMessage {
  result: { text: string };
}

export interface WordList {
  canonicals: string[];
  aliasMap: Record<string, string>;
}

export interface KwsLogEntry {
  id: number;
  time: string;
  text: string;
  kind: "hit" | "final";
}

function parseWordList(text: string): WordList {
  const aliasMap: Record<string, string> = {};
  const canonicals: string[] = [];
  for (const group of text.trim().split(/\s+/)) {
    const spellings = group
      .split("/")
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    const canonical = spellings[0];
    if (canonical === undefined) continue;
    canonicals.push(canonical);
    for (const s of spellings) aliasMap[s] = canonical;
  }
  return { canonicals, aliasMap };
}

function timestamp(): string {
  return new Date().toLocaleTimeString(undefined, { hour12: false });
}

export function useKeywordSpotter() {
  const [status, setStatus] = useState("Loading model…");
  const [statusIsError, setStatusIsError] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [wordsText, setWordsText] = useState(DEFAULT_WORDS);
  const [wordList, setWordList] = useState<WordList>(() =>
    parseWordList(DEFAULT_WORDS),
  );
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());
  const [logEntries, setLogEntries] = useState<KwsLogEntry[]>([]);

  const modelRef = useRef<Model | null>(null);
  const recognizerRef = useRef<KaldiRecognizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const aliasMapRef = useRef<Record<string, string>>(wordList.aliasMap);
  const seenWordsRef = useRef<string[]>([]);
  const listeningRef = useRef(false);
  const logIdRef = useRef(0);

  const log = useCallback((text: string, kind: KwsLogEntry["kind"]) => {
    logIdRef.current += 1;
    const entry: KwsLogEntry = {
      id: logIdRef.current,
      time: timestamp(),
      text,
      kind,
    };
    setLogEntries((prev) => [...prev.slice(-199), entry]);
  }, []);

  const fire = useCallback(
    (spelling: string) => {
      const word = aliasMapRef.current[spelling];
      if (word === undefined) return;
      log(word, "hit");
      setFlashing((prev) => new Set(prev).add(word));
      setTimeout(() => {
        setFlashing((prev) => {
          const next = new Set(prev);
          next.delete(word);
          return next;
        });
      }, 400);
    },
    [log],
  );

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
      if (text.trim() !== "") log(`(final: ${text})`, "final");
    },
    [log],
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
        setStatus("Model loaded — click Listen and allow the microphone");
      } catch (err) {
        if (!cancelled) {
          setStatus(`Failed to load model: ${(err as Error).message}`);
          setStatusIsError(true);
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

  const createRecognizer = useCallback((list: WordList) => {
    const model = modelRef.current;
    const audioContext = audioContextRef.current;
    if (model === null || audioContext === null) return;
    aliasMapRef.current = list.aliasMap;
    const grammar = [...Object.keys(list.aliasMap), "[unk]"];

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
  }, []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 },
    });
    mediaStreamRef.current = stream;
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    createRecognizer(parseWordList(wordsText));

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
    setStatus("Listening — say a word");
    setStatusIsError(false);
  }, [createRecognizer, wordsText]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    void audioContextRef.current?.close();
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    setListening(false);
    setStatus("Stopped — click Listen to resume");
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start().catch((err: Error) => {
        setStatus(`Microphone error: ${err.message}`);
        setStatusIsError(true);
      });
    }
  }, [listening, start, stop]);

  const applyWords = useCallback(() => {
    const list = parseWordList(wordsText);
    setWordList(list);
    if (listening) {
      createRecognizer(list);
      setStatus("Word list updated — listening");
    } else {
      aliasMapRef.current = list.aliasMap;
      setStatus(
        modelReady ? "Word list updated — click Listen" : "Loading model…",
      );
    }
    log(`(word list: ${wordsText})`, "final");
  }, [createRecognizer, listening, log, modelReady, wordsText]);

  return {
    status,
    statusIsError,
    modelReady,
    listening,
    toggleListening,
    wordsText,
    setWordsText,
    applyWords,
    wordList,
    flashing,
    logEntries,
  };
}

export type KeywordSpotterController = ReturnType<typeof useKeywordSpotter>;
