"use client";

// Companions Slice 1 orchestrator: ties the mic, STT socket, and TTS player
// into the barge-in loop, with one AbortController per companion reply-turn.
// The mic/STT callbacks are created once (they outlive many renders) but must
// read LIVE values — the current phase, whether a reply is playing, the active
// turn's controller — so everything they touch lives in a ref; useState only
// mirrors the `status` the panel renders. Integration code — no unit test (the
// pure lifecycle/barge-in decisions live in session-policy.ts and are tested in
// Task 5); the wiring is exercised in the Task 13 acceptance run.

import { useCallback, useEffect, useRef, useState } from "react";
import { CANNED_REPLY, ELISE } from "@/lib/companions/companions";
import { startMic, type MicHandle } from "@/lib/voice/mic";
import { createStt, type Stt } from "@/lib/voice/stt";
import { createTtsPlayer, type TtsPlayer } from "@/lib/voice/tts";
import {
  isBargeIn,
  shouldOpenSocket,
  type SttPhase,
} from "@/lib/voice/session-policy";

export type VoiceStatus = {
  micOn: boolean;
  phase: SttPhase;
  vadSpeaking: boolean;
  rms: number;
  preRollFrames: number;
  partial: string;
  committed: string;
  replyPlaying: boolean;
};

export type VoiceSession = {
  start: () => void;
  stop: () => void;
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
};

// Close the STT socket after this long without voice.
const STT_IDLE_TIMEOUT_MS = 8000;
const MAYBE_CLOSE_INTERVAL_MS = 500;

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
  const turnRef = useRef<AbortController | null>(null);
  const replyPlayingRef = useRef(false);
  const vadSpeakingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setReplyPlaying = useCallback((playing: boolean): void => {
    replyPlayingRef.current = playing;
    setStatus((s) => ({ ...s, replyPlaying: playing }));
  }, []);

  // Speak the canned reply on a fresh turn controller; clear replyPlaying once
  // the play promise settles (natural end, stop(), or barge-in abort).
  const startReply = useCallback((): void => {
    const tts = ttsRef.current;
    if (tts === null) return;
    const controller = new AbortController();
    turnRef.current = controller;
    setReplyPlaying(true);
    void tts
      .play(CANNED_REPLY, ELISE.voiceId, controller.signal)
      .finally(() => {
        // Only clear if this same turn is still the active one — a newer turn may
        // have superseded us before this promise settled.
        if (turnRef.current === controller) {
          turnRef.current = null;
          setReplyPlaying(false);
        }
      });
  }, [setReplyPlaying]);

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
    ttsRef.current = createTtsPlayer(audioEl);

    const stt = createStt({
      onPartial: (text) => setStatus((s) => ({ ...s, partial: text })),
      onCommitted: (text) => {
        setStatus((s) => ({ ...s, committed: text }));
        startReply();
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
          turnRef.current?.abort();
          turnRef.current = null;
          setReplyPlaying(false);
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
  }, [setReplyPlaying, startReply]);

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
    sttRef.current?.close();
    sttRef.current = null;
    micHandleRef.current?.stop();
    micHandleRef.current = null;
    replyPlayingRef.current = false;
    vadSpeakingRef.current = false;
    startingRef.current = false;
    setStatus(IDLE_STATUS);
  }, []);

  // Tear everything down on unmount.
  useEffect(() => stop, [stop]);

  return { start, stop, status, audioRef };
}
