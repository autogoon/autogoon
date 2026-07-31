'use client';

// The shared keyword spotter, as a provider around the single vosk recognizer.
// There is exactly ONE recognizer (one mic stream, one model, one grammar), so
// it lives here and panels talk to it rather than each owning their own.
//
// The grammar is the union of two slots:
//   - GLOBAL words — navigation and the safe word, owned by the page (the
//     setGlobalWords effect in page.tsx).
//   - the PLAY MODE words — owned by whichever panel is currently active; it
//     calls setPlayModeKeywords with its enabled words and clears them when it
//     stops being active, so only one play mode's words are ever live.
// A third, EXCLUSIVE slot overrides both: while a test word is set (the safe
// word test modal), the grammar is only that word — the easiest possible
// recognition setting, so a word that fails there is genuinely outside the
// model's vocabulary.
// Detections are broadcast to every registered keywordListener; a listener acts
// on the words it owns and ignores the rest.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { KaldiRecognizer, Model } from 'vosk-browser';

const MODEL_URL = '/vosk-model-small-en-us-0.15.tar.gz';

// vosk-browser's event payloads, structurally typed here to avoid reaching
// into the package's internal type paths.
interface ResultMessage {
  result: { text: string };
}
interface PartialMessage {
  result: { partial: string };
}

export interface KeywordSpotter {
  modelReady: boolean;
  listening: boolean;
  starting: boolean;
  toggleListening: () => void;
  // Exactly the words in vosk's current grammar — the source of truth for what
  // the app is listening for.
  listeningFor: string[];
  flashing: ReadonlySet<string>;
  // The page sets the global words: navigation plus the safe word, whatever is
  // valid right now (the setGlobalWords effect in page.tsx).
  setGlobalWords: (words: string[]) => void;
  // The active panel sets its play mode words (and clears them on deactivate).
  setPlayModeKeywords: (words: string[]) => void;
  // While non-null, the grammar is ONLY this word (the safe word test modal).
  // Callers must clear it (null) on close/unmount to restore normal listening.
  setExclusiveTestWord: (word: string | null) => void;
  // Subscribe to detections; returns an unsubscribe. Register inside an effect.
  keywordListener: (fn: (word: string) => void) => () => void;
  // Subscribe to the decoder's in-flight partial text (fires many times a
  // second while audio flows; "" during silence). Lets the UI show that vosk
  // is hearing something before the settled result arrives (the safe word
  // test's spinner). Deliberately a listener, not state — mirroring this into
  // React state here would re-render every consumer per audio chunk.
  partialListener: (fn: (text: string) => void) => () => void;
}

const Context = createContext<KeywordSpotter | null>(null);

export function KeywordSpotterProvider({ children }: { children: ReactNode }) {
  const [modelReady, setModelReady] = useState(false);
  const [listening, setListening] = useState(false);
  // True from the moment we start connecting to the mic until we're listening
  // (or the attempt fails), so the UI can disable the toggle meanwhile.
  const [starting, setStarting] = useState(false);
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());

  // The two grammar slots as state, so listeningFor stays reactive and a change
  // rebuilds the recognizer.
  const [globalWords, setGlobalWordsState] = useState<string[]>([]);
  const [playModeWords, setPlayModeWordsState] = useState<string[]>([]);
  const [exclusiveTestWord, setExclusiveTestWord] = useState<string | null>(
    null,
  );
  const words = useMemo(
    () =>
      exclusiveTestWord !== null
        ? [exclusiveTestWord]
        : [...new Set([...globalWords, ...playModeWords])],
    [globalWords, playModeWords, exclusiveTestWord],
  );

  const modelRef = useRef<Model | null>(null);
  const recognizerRef = useRef<KaldiRecognizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const aliasMapRef = useRef<Record<string, string>>({});
  const listeningRef = useRef(false);
  // Current grammar words, kept in a ref so the long-lived recognizer callbacks
  // reach the current value.
  const wordsRef = useRef<string[]>(words);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  // Detection listeners (the active panel's + the page's global handler).
  const listenersRef = useRef<Set<(word: string) => void>>(new Set());
  const keywordListener = useCallback((fn: (word: string) => void) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  // Partial-result listeners (see the interface note on partialListener).
  const partialListenersRef = useRef<Set<(text: string) => void>>(new Set());
  const partialListener = useCallback((fn: (text: string) => void) => {
    partialListenersRef.current.add(fn);
    return () => {
      partialListenersRef.current.delete(fn);
    };
  }, []);

  const setGlobalWords = useCallback((next: string[]) => {
    setGlobalWordsState((prev) =>
      prev.length === next.length && prev.every((w, i) => w === next[i])
        ? prev
        : next,
    );
  }, []);
  const setPlayModeKeywords = useCallback((next: string[]) => {
    setPlayModeWordsState((prev) =>
      prev.length === next.length && prev.every((w, i) => w === next[i])
        ? prev
        : next,
    );
  }, []);

  // The grammar is exactly the union words. Each maps to itself so a detection
  // resolves and fires.
  const buildAliasMap = useCallback((): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const w of wordsRef.current) map[w] = w;
    return map;
  }, []);

  const fire = useCallback((spelling: string) => {
    const word = aliasMapRef.current[spelling];
    if (word === undefined) return;
    for (const fn of listenersRef.current) fn(word);
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
      const detected = text
        .trim()
        .split(/\s+/)
        .filter((w) => w !== '' && w !== '[unk]');
      for (const word of detected) fire(word);
    },
    [fire],
  );
  const handleFinalRef = useRef(handleFinal);
  useEffect(() => {
    handleFinalRef.current = handleFinal;
  }, [handleFinal]);

  // Load the model once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { createModel } = await import('vosk-browser');
        const model = await createModel(MODEL_URL);
        if (cancelled) {
          model.terminate();
          return;
        }
        modelRef.current = model;
        setModelReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load KWS model:', err);
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
    const grammar = [...new Set([...Object.keys(aliasMap), '[unk]'])];

    recognizerRef.current?.remove();
    const recognizer = new model.KaldiRecognizer(
      audioContext.sampleRate,
      JSON.stringify(grammar),
    );
    recognizer.on('result', (m) => {
      handleFinalRef.current((m as unknown as ResultMessage).result.text);
    });
    recognizer.on('partialresult', (m) => {
      const text = (m as unknown as PartialMessage).result.partial;
      for (const fn of partialListenersRef.current) fn(text);
    });
    recognizerRef.current = recognizer;
  }, [buildAliasMap]);

  // Rebuild the recognizer whenever the grammar changes while listening.
  useEffect(() => {
    if (listeningRef.current) createRecognizer();
  }, [words, createRecognizer]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      });
      mediaStreamRef.current = stream;
      // getUserMedia has resolved, so the stream is live; if any of the setup
      // below throws (addModule rejecting, createMediaStreamSource, …) we must
      // stop the stream and close the context we opened. Otherwise the mic
      // indicator stays lit with nothing listening, and stop() cannot reach
      // either — toggleListening only calls it while `listening` is true, so
      // the next start() overwrites the refs holding both.
      let audioContext: AudioContext | undefined;
      try {
        audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        // Created without a user gesture (auto-start on load), the context can
        // come up suspended; resume it so audio actually flows.
        void audioContext.resume();
        createRecognizer();

        await audioContext.audioWorklet.addModule('/kws-audio-worklet.js');
        const ctx = audioContext;
        const source = ctx.createMediaStreamSource(stream);
        const capture = new AudioWorkletNode(ctx, 'kws-capture');
        capture.port.onmessage = (e: MessageEvent<Float32Array>) => {
          if (recognizerRef.current !== null && listeningRef.current) {
            recognizerRef.current.acceptWaveformFloat(e.data, ctx.sampleRate);
          }
        };
        source.connect(capture);
        // The worklet emits silence, but it must reach the destination to be
        // pulled by the audio graph.
        capture.connect(ctx.destination);

        listeningRef.current = true;
        setListening(true);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        void audioContext?.close();
        mediaStreamRef.current = null;
        audioContextRef.current = null;
        throw err;
      }
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
        console.error('Microphone error:', err);
      });
    }
  }, [listening, start, stop]);

  // Start listening as soon as the model is ready, so the app is live on load
  // without a click. Guarded so it fires only once — a manual stop stays stopped.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!modelReady || autoStartedRef.current) return;
    autoStartedRef.current = true;
    start().catch((err: Error) => {
      console.error('Microphone error:', err);
    });
  }, [modelReady, start]);

  const value = useMemo<KeywordSpotter>(
    () => ({
      modelReady,
      listening,
      starting,
      toggleListening,
      listeningFor: words,
      flashing,
      setGlobalWords,
      setPlayModeKeywords,
      setExclusiveTestWord,
      keywordListener,
      partialListener,
    }),
    [
      modelReady,
      listening,
      starting,
      toggleListening,
      words,
      flashing,
      setGlobalWords,
      setPlayModeKeywords,
      keywordListener,
      partialListener,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useKeywordSpotter(): KeywordSpotter {
  const ctx = useContext(Context);
  if (ctx === null) {
    throw new Error(
      'useKeywordSpotter must be used within KeywordSpotterProvider',
    );
  }
  return ctx;
}

// The set of words flashing right now, for controls that light up when their
// voice word is recognised (the voiceCommand chip). Tolerates being called outside a
// provider (returns empty) so Button stays usable anywhere.
const NO_FLASH: ReadonlySet<string> = new Set();
export function useKeywordFlash(): ReadonlySet<string> {
  return useContext(Context)?.flashing ?? NO_FLASH;
}
