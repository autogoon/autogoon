"use client";

// Companions voice-session orchestrator: ties the mic, STT socket, LLM client
// and TTS player into the barge-in loop, with one AbortController per companion
// reply-turn. A turn runs on any text — a committed voice transcript (hands-free,
// auto-spoken) or a typed prompt via submitText — streaming the LLM reply and,
// when asked, speaking it. The mic/STT callbacks are created once (they outlive
// many renders) but must read LIVE values — the current phase, whether a reply is
// playing, the active turn's controller — so everything they touch lives in a
// ref; useState only mirrors the `status` the panel renders. Integration code —
// no unit test (the pure lifecycle/barge-in decisions live in session-policy.ts
// and are unit-tested there); the wiring is exercised by driving the panel.

import { useCallback, useEffect, useRef, useState } from "react";
import { ELISE } from "@/lib/companions/companions";
import { createLlmClient, type LlmClient } from "@/lib/llm/client";
import { startMic, type MicHandle } from "@/lib/voice/mic";
import { createStt, type Stt } from "@/lib/voice/stt";
import { createTtsPlayer, type TtsPlayer } from "@/lib/voice/tts";
import {
  isBargeIn,
  shouldOpenSocket,
  type SttPhase,
} from "@/lib/voice/session-policy";
import {
  appendAssistant,
  appendUser,
  parse,
  serialize,
  toLlmMessages,
  type Thread,
  type ThreadTurn,
} from "@/lib/companions/conversation";

export type TurnMetrics = {
  llm: { ttftMs: number; totalMs: number; tps: number | null } | null;
  tts: { ttfbMs: number | null; totalMs: number } | null;
};

export type VoiceStatus = {
  micOn: boolean;
  phase: SttPhase;
  vadSpeaking: boolean;
  rms: number;
  preRollFrames: number;
  partial: string;
  committed: string;
  replyPlaying: boolean;
  // The LLM reply, streamed token-by-token as it generates — the exact text a
  // spoken ("say it") turn buffers and hands to TTS.
  replyText: string;
  // Surfaced so the panel can show an LLM failure (e.g. OpenRouter unreachable)
  // instead of silently saying nothing.
  replyError: string | null;
  metrics: TurnMetrics;
  // True from when a spoken reply's TTS request is sent until the first audio
  // bytes come back — the "waiting for speech" state. Cleared once audio starts.
  awaitingSpeech: boolean;
  // The rolling conversation transcript, mirrored from threadRef so the panel
  // can render it. Reset to [] on Clear, but preserved across Stop-listening.
  thread: ThreadTurn[];
};

export type VoiceSession = {
  start: () => void;
  stop: () => void;
  // Run a turn on arbitrary text (a typed prompt, or a committed transcript):
  // stream the LLM reply and, when `speak`, buffer it whole and speak it. Works
  // whether or not the mic is running.
  submitText: (text: string, opts?: { speak?: boolean }) => void;
  // Abort the in-flight reply turn (LLM stream + TTS) without tearing the mic
  // session down — the Stop button, and the only way to cut a spoken reply when
  // the mic is off and there's no barge-in.
  cancelReply: () => void;
  // Wipe the conversation: empties the live thread, the mirror, and the
  // localStorage key. Button-only (no spoken word), instant, no confirm.
  clearThread: () => void;
  status: VoiceStatus;
  audioRef: React.RefObject<HTMLAudioElement | null>;
};

const IDLE_STATUS: VoiceStatus = {
  micOn: false,
  phase: "closed",
  vadSpeaking: false,
  rms: 0,
  preRollFrames: 0,
  partial: "",
  committed: "",
  replyPlaying: false,
  replyText: "",
  replyError: null,
  metrics: { llm: null, tts: null },
  awaitingSpeech: false,
  thread: [],
};

// Close the STT socket after this long without voice.
const STT_IDLE_TIMEOUT_MS = 8000;
const MAYBE_CLOSE_INTERVAL_MS = 500;

// Persistence key, namespaced per companion so each keeps its own thread.
const THREAD_KEY = `companions:thread:${ELISE.name.toLowerCase()}`;

export function useVoiceSession(): VoiceSession {
  const [status, setStatus] = useState<VoiceStatus>(IDLE_STATUS);

  // Panel attaches this to a rendered <audio> element; the TTS player plays
  // through it.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live values read inside the once-created mic/STT callbacks — refs, not
  // state, so those callbacks never see a stale closure.
  // Set synchronously at the top of start() and cleared in stop(); guards
  // against a second start() slipping through before the async mic open has
  // populated micHandleRef, which would leak the first interval/STT/TTS.
  const startingRef = useRef(false);
  const micHandleRef = useRef<MicHandle | null>(null);
  const sttRef = useRef<Stt | null>(null);
  const ttsRef = useRef<TtsPlayer | null>(null);
  const llmRef = useRef<LlmClient | null>(null);
  const turnRef = useRef<AbortController | null>(null);
  const replyPlayingRef = useRef(false);
  const vadSpeakingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The live conversation thread — source of truth, read/written inside the
  // once-created callbacks like the other live refs, mirrored into status.thread.
  const threadRef = useRef<Thread>([]);

  const setReplyPlaying = useCallback((playing: boolean): void => {
    replyPlayingRef.current = playing;
    setStatus((s) => ({ ...s, replyPlaying: playing }));
  }, []);

  // Write-through persistence: every thread mutation updates the ref, the
  // mirror, and localStorage together. Storage failures (quota/unavailable) are
  // swallowed — the in-memory thread still works for this session.
  const persistThread = useCallback((thread: Thread): void => {
    threadRef.current = thread;
    setStatus((s) => ({ ...s, thread }));
    try {
      localStorage.setItem(THREAD_KEY, serialize(thread));
    } catch {
      // ignore: storage full or unavailable
    }
  }, []);

  const clearThread = useCallback((): void => {
    // A full reset also tears down any live turn, so an in-flight reply can't
    // commit an assistant turn back into the just-cleared thread (mirrors stop()).
    turnRef.current?.abort();
    turnRef.current = null;
    threadRef.current = [];
    setStatus((s) => ({ ...s, thread: [] }));
    try {
      localStorage.removeItem(THREAD_KEY);
    } catch {
      // ignore: storage unavailable
    }
  }, []);

  // Restore a persisted conversation on mount so a reload keeps the memory.
  // localStorage is browser-only, so this runs in an effect, not at ref init.
  useEffect(() => {
    const seeded = parse(localStorage.getItem(THREAD_KEY));
    threadRef.current = seeded;
    setStatus((s) => ({ ...s, thread: seeded }));
  }, []);

  // The TTS player and LLM client, created on demand. start() makes them when the
  // mic opens; submitText() makes them for a typed turn so typing works with the
  // mic off. Both are stashed in refs and torn down in stop().
  const ensureClients = useCallback((): {
    tts: TtsPlayer;
    llm: LlmClient;
  } | null => {
    const audioEl = audioRef.current;
    if (audioEl === null) return null;
    ttsRef.current ??= createTtsPlayer(audioEl);
    llmRef.current ??= createLlmClient(ELISE.model);
    return { tts: ttsRef.current, llm: llmRef.current };
  }, []);

  // Abort the in-flight reply turn (its LLM stream and TTS, via the one
  // controller) and clear the playing flag. Used by barge-in, the Stop button,
  // and as the supersede step when a new turn starts.
  const cancelReply = useCallback((): void => {
    turnRef.current?.abort();
    turnRef.current = null;
    setReplyPlaying(false);
    setStatus((s) => ({ ...s, awaitingSpeech: false }));
  }, [setReplyPlaying]);

  // A companion turn on arbitrary text — a typed prompt or a committed
  // transcript. Stream the LLM reply into status.replyText token-by-token; when
  // `speak`, buffer the whole reply and hand it to TTS. replyPlaying is true for
  // the entire turn (from before the first token), so a barge-in or Stop during
  // generation — not just during playback — aborts this same controller,
  // cancelling the LLM stream and TTS together. An LLM error surfaces in
  // status.replyError and the session stays usable.
  const submitText = useCallback(
    (text: string, opts?: { speak?: boolean }): void => {
      const prompt = text.trim();
      if (prompt === "") return;
      const clients = ensureClients();
      if (clients === null) return;
      const { tts, llm } = clients;
      const speak = opts?.speak ?? false;

      // Commit the user turn the moment it's submitted (ref + state + persist).
      persistThread(appendUser(threadRef.current, prompt));

      // Supersede any in-flight turn (its LLM stream + TTS) before starting.
      turnRef.current?.abort();
      const controller = new AbortController();
      turnRef.current = controller;
      setStatus((s) => ({
        ...s,
        replyText: "",
        replyError: null,
        metrics: { llm: null, tts: null },
        awaitingSpeech: false,
      }));
      setReplyPlaying(true);

      void (async (): Promise<void> => {
        try {
          let reply = "";
          let reasoning: unknown[] | undefined;
          let completionTokens: number | null = null;
          const llmStart = performance.now();
          let ttftMs: number | null = null;
          for await (const delta of llm.stream(
            toLlmMessages(
              threadRef.current,
              ELISE.systemPrompt,
              ELISE.passesReasoning,
            ),
            {
              signal: controller.signal,
              onUsage: (u) => {
                completionTokens = u.completionTokens;
              },
              onReasoning: (d) => {
                reasoning = d;
              },
            },
          )) {
            if (controller.signal.aborted || turnRef.current !== controller) {
              return;
            }
            if (ttftMs === null) ttftMs = performance.now() - llmStart;
            reply += delta;
            setStatus((s) => ({ ...s, replyText: s.replyText + delta }));
          }
          const llmTotalMs = performance.now() - llmStart;
          // A turn superseded/aborted during the final read must not write its
          // stale metrics over the successor's; mirror the loop's guard.
          if (controller.signal.aborted || turnRef.current !== controller) {
            return;
          }
          if (ttftMs !== null) {
            const ttft = ttftMs;
            const tokens = completionTokens;
            // Output throughput over the decode window (first token → done);
            // null when the backend didn't return usage.
            const decodeSec = Math.max((llmTotalMs - ttft) / 1000, 0.001);
            const tps = tokens !== null ? tokens / decodeSec : null;
            setStatus((s) => ({
              ...s,
              metrics: {
                ...s.metrics,
                llm: { ttftMs: ttft, totalMs: llmTotalMs, tps },
              },
            }));
          }
          // Generation completed under this turn's guard (a mid-generation cut
          // returned earlier), so the full reply + full reasoning are in hand:
          // commit the assistant turn. reasoning is replayed only when the
          // companion passes it; a superseded/aborted turn never reaches here,
          // so no truncated reasoning block is ever stored.
          if (reply.trim() !== "") {
            persistThread(
              appendAssistant(
                threadRef.current,
                reply,
                ELISE.passesReasoning ? reasoning : undefined,
              ),
            );
          }
          if (
            controller.signal.aborted ||
            turnRef.current !== controller ||
            reply.trim() === "" ||
            !speak
          ) {
            return;
          }
          const ttsStart = performance.now();
          let ttsTtfbMs: number | null = null;
          // "Waiting for speech" until the first audio bytes arrive.
          setStatus((s) => ({ ...s, awaitingSpeech: true }));
          await tts.play(reply, ELISE.voiceId, controller.signal, () => {
            ttsTtfbMs = performance.now() - ttsStart;
            setStatus((s) => ({ ...s, awaitingSpeech: false }));
          });
          // tts.play resolves even on barge-in/stop, so guard before recording:
          // a superseded turn must not overwrite the current turn's metrics.
          if (controller.signal.aborted || turnRef.current !== controller) {
            return;
          }
          setStatus((s) => ({
            ...s,
            metrics: {
              ...s.metrics,
              tts: { ttfbMs: ttsTtfbMs, totalMs: performance.now() - ttsStart },
            },
          }));
        } catch (e) {
          // Aborted turns land here too; only surface a real failure.
          if (!controller.signal.aborted && turnRef.current === controller) {
            setStatus((s) => ({
              ...s,
              replyError: e instanceof Error ? e.message : "LLM request failed",
            }));
          }
        } finally {
          // Only clear if this same turn is still active — a newer turn, a
          // barge-in, or Stop may have superseded us before this settled.
          if (turnRef.current === controller) {
            turnRef.current = null;
            setReplyPlaying(false);
            // Catch-all: if TTS resolved without first audio (error/abort) the
            // "waiting for speech" flag would otherwise stick.
            setStatus((s) => ({ ...s, awaitingSpeech: false }));
          }
        }
      })();
    },
    [ensureClients, setReplyPlaying, persistThread],
  );

  const start = useCallback((): void => {
    // Already running or mid-start. micHandleRef isn't set until the async mic
    // open resolves, so guard synchronously to keep a fast second call from
    // starting a second interval/STT/TTS.
    if (startingRef.current) return;
    startingRef.current = true;

    const audioEl = audioRef.current;
    if (audioEl === null) {
      startingRef.current = false;
      return;
    }
    ensureClients();

    const stt = createStt({
      onPartial: (text) => setStatus((s) => ({ ...s, partial: text })),
      onCommitted: (text) => {
        // A committed transcript is a spoken turn: hands-free, so run it as a
        // "say it" (LLM → speak) without waiting on a button.
        setStatus((s) => ({ ...s, committed: text }));
        submitText(text, { speak: true });
      },
      onPhase: (phase) => setStatus((s) => ({ ...s, phase })),
    });
    sttRef.current = stt;

    void startMic({
      onFrame: (b64) => stt.sendFrame(b64),
      onRms: (rms) => {
        // Keep the socket alive across sustained speech: refresh lastVoiceAt on
        // every voiced frame, not just at onset, so a long utterance doesn't
        // trip the idle-close timeout mid-sentence.
        if (vadSpeakingRef.current) stt.noteVoice(Date.now());
        setStatus((s) => ({
          ...s,
          rms,
          preRollFrames: micHandleRef.current?.preRoll.length ?? 0,
        }));
      },
      onOnset: () => {
        vadSpeakingRef.current = true;
        // Barge-in: interrupt the companion's reply mid-sentence.
        if (isBargeIn(replyPlayingRef.current, true)) {
          cancelReply();
        }
        // Whether or not it was a barge-in, an onset from a closed socket opens
        // a fresh listening turn, flushing the pre-roll so the opening word
        // isn't clipped.
        if (shouldOpenSocket(stt.phase(), true)) {
          const preRoll = micHandleRef.current?.preRoll.flush() ?? [];
          void stt.open(preRoll).catch(() => {});
        }
        stt.noteVoice(Date.now());
        setStatus((s) => ({ ...s, vadSpeaking: true }));
      },
      onOffset: () => {
        vadSpeakingRef.current = false;
        setStatus((s) => ({ ...s, vadSpeaking: false }));
      },
    })
      .then((handle) => {
        // stop() may have been called before the mic finished opening; if so,
        // tear the fresh handle down immediately.
        if (sttRef.current !== stt) {
          handle.stop();
          return;
        }
        micHandleRef.current = handle;
        setStatus((s) => ({ ...s, micOn: true }));
      })
      .catch(() => {
        // getUserMedia / worklet failed to start: leave the session idle. Clear
        // the synchronous guard so a later start() can retry — but only if a
        // stop()+start() hasn't already handed the session to a newer stt.
        if (sttRef.current === stt) startingRef.current = false;
      });

    intervalRef.current = setInterval(() => {
      stt.maybeClose(Date.now(), STT_IDLE_TIMEOUT_MS);
    }, MAYBE_CLOSE_INTERVAL_MS);
  }, [ensureClients, submitText, cancelReply]);

  const stop = useCallback((): void => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Abort the in-flight turn (also stops the TTS via its signal).
    turnRef.current?.abort();
    turnRef.current = null;
    ttsRef.current?.stop();
    ttsRef.current = null;
    llmRef.current = null;
    sttRef.current?.close();
    sttRef.current = null;
    micHandleRef.current?.stop();
    micHandleRef.current = null;
    replyPlayingRef.current = false;
    vadSpeakingRef.current = false;
    startingRef.current = false;
    // The conversation persists across Stop-listening — only Clear (or a fresh
    // load) resets it — so re-seed the mirror from the intact threadRef.
    setStatus({ ...IDLE_STATUS, thread: threadRef.current });
  }, []);

  // Tear everything down on unmount.
  useEffect(() => stop, [stop]);

  return {
    start,
    stop,
    submitText,
    cancelReply,
    clearThread,
    status,
    audioRef,
  };
}
