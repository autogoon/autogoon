'use client';

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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Companion } from '@/lib/companions/companions';
import { toRequestTools, type CompanionTool } from '@/lib/companions/tools';
import {
  createLlmClient,
  type LlmClient,
  type LlmMessage,
  type ToolCall,
} from '@/lib/llm/client';
import { startMic, type MicHandle } from '@/lib/voice/mic';
import { createStt, type Stt } from '@/lib/voice/stt';
import { createTtsPlayer, type TtsPlayer } from '@/lib/voice/tts';
import {
  confirmSpeech,
  isBargeIn,
  partialHasWord,
  type SttPhase,
} from '@/lib/voice/session-policy';
import {
  appendAssistant,
  appendTool,
  appendUser,
  describeClock,
  parse,
  serialize,
  toLlmMessages,
  type Thread,
  type ThreadTurn,
} from '@/lib/companions/conversation';

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
  // Frames actually streamed to the STT this session. At FRAME_MS each, this is
  // the audio ElevenLabs bill for — the number to check a session against the
  // usage dashboard, and the one that should stay flat between turns.
  sentFrames: number;
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
  // True while her reply audio is actually playing: set where awaitingSpeech
  // clears (first audio bytes), cleared when the utterance finishes or the
  // turn is cancelled/superseded. The bit replyPlaying can't give a display —
  // that flag spans the whole turn, generation included.
  speaking: boolean;
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
  // The exact LLM request a turn submitted right now would send — same thread
  // projection and system-prompt fill as submitText, including gap markers and
  // the live {{TOY_STATUS}}/{{NOW}} values. Debug-only (the panel's request
  // viewer); building it sends nothing.
  previewLlmMessages: () => LlmMessage[];
  status: VoiceStatus;
  audioRef: React.RefObject<HTMLAudioElement | null>;
};

const IDLE_STATUS: VoiceStatus = {
  micOn: false,
  phase: 'closed',
  vadSpeaking: false,
  rms: 0,
  preRollFrames: 0,
  sentFrames: 0,
  partial: '',
  committed: '',
  replyPlaying: false,
  replyText: '',
  replyError: null,
  metrics: { llm: null, tts: null },
  awaitingSpeech: false,
  speaking: false,
  thread: [],
};

// Persistence key, namespaced per companion so each keeps its own thread.
const threadKeyFor = (companion: Companion): string =>
  `companions:thread:${companion.id}`;

// Fill a prompt's live markers: the device state at {{TOY_STATUS}} and the
// wall clock at {{NOW}}. A prompt lacking a marker is unaffected.
const buildSystemPrompt = (template: string, deviceState: string): string =>
  template
    .replace('{{TOY_STATUS}}', deviceState === '' ? 'unknown' : deviceState)
    .replace('{{NOW}}', describeClock(Date.now()));

export function useVoiceSession(opts: {
  // The chosen companion — its voice, model and prompt drive the whole turn.
  // Fixed for the life of a play session (the nav lock stops you switching
  // mid-session); changing it reloads that companion's saved thread.
  companion: Companion;
  tools?: CompanionTool[];
  getDeviceState?: () => string;
  onToolRun?: (name: string, result: string) => void;
  // Debug hook: emit a line into the panel's event log. Wired to the same
  // append() as tool dispatch, for tracing the LLM/barge-in round-trip.
  onLog?: (text: string, kind?: string) => void;
}): VoiceSession {
  const [status, setStatus] = useState<VoiceStatus>(IDLE_STATUS);

  // The companion, read inside the once-created mic/STT/turn callbacks — a ref,
  // like the other live values, so those callbacks never see a stale persona.
  const companionRef = useRef<Companion>(opts.companion);
  companionRef.current = opts.companion;
  // The current thread key, derived from the companion and read inside the
  // once-created persist/clear callbacks (which keep empty deps).
  const threadKey = threadKeyFor(opts.companion);
  const threadKeyRef = useRef(threadKey);
  threadKeyRef.current = threadKey;

  // Panel attaches this to a rendered <audio> element; the TTS player plays
  // through it.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live values for the device tools, refreshed every render (matching the
  // ref pattern below) so submitText's once-created callback reads the active
  // panel's tools/state/handler without being recreated when they change.
  const toolsRef = useRef<CompanionTool[]>(opts?.tools ?? []);
  toolsRef.current = opts?.tools ?? [];
  const getDeviceStateRef = useRef<() => string>(
    opts?.getDeviceState ?? (() => ''),
  );
  getDeviceStateRef.current = opts?.getDeviceState ?? (() => '');
  const onToolRunRef = useRef<
    ((name: string, result: string) => void) | undefined
  >(opts?.onToolRun);
  onToolRunRef.current = opts?.onToolRun;
  const onLogRef = useRef<((text: string, kind?: string) => void) | undefined>(
    opts?.onLog,
  );
  onLogRef.current = opts?.onLog;

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
  // The model the cached llmRef was built with, so ensureClients can tell when
  // a companion switch means the client must be rebuilt.
  const llmModelRef = useRef<string | null>(null);
  const turnRef = useRef<AbortController | null>(null);
  const replyPlayingRef = useRef(false);
  const vadSpeakingRef = useRef(false);
  // Whether the current utterance has confirmed real speech (see confirmSpeech)
  // — the gate on surfacing partials in status. Reset at each utterance
  // boundary: a committed transcript or the socket closing.
  const speechConfirmedRef = useRef(false);
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
      localStorage.setItem(threadKeyRef.current, serialize(thread));
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
      localStorage.removeItem(threadKeyRef.current);
    } catch {
      // ignore: storage unavailable
    }
  }, []);

  // Restore a persisted conversation so a reload keeps the memory — and reload
  // it when the companion changes, so each picker choice brings up its own
  // thread. localStorage is browser-only, so this runs in an effect.
  useEffect(() => {
    const seeded = parse(localStorage.getItem(threadKey));
    threadRef.current = seeded;
    setStatus((s) => ({ ...s, thread: seeded }));
  }, [threadKey]);

  // The debug request viewer's data: project the live thread exactly as
  // submitText would for a request sent this instant.
  const previewLlmMessages = useCallback((): LlmMessage[] => {
    const companion = companionRef.current;
    return toLlmMessages(
      threadRef.current,
      buildSystemPrompt(companion.systemPrompt, getDeviceStateRef.current()),
      companion.passesReasoning,
    );
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
    // The LLM client is bound to a model; rebuild it if the companion (hence
    // the model) has changed since it was made. The TTS player is model-free
    // (the voice id is passed per utterance), so it's reused as-is.
    const model = companionRef.current.model;
    if (llmRef.current === null || llmModelRef.current !== model) {
      llmRef.current = createLlmClient(model);
      llmModelRef.current = model;
    }
    return { tts: ttsRef.current, llm: llmRef.current };
  }, []);

  // Abort the in-flight reply turn (its LLM stream and TTS, via the one
  // controller) and clear the playing flag. Used by barge-in, the Stop button,
  // and as the supersede step when a new turn starts.
  const cancelReply = useCallback((): void => {
    turnRef.current?.abort();
    turnRef.current = null;
    setReplyPlaying(false);
    setStatus((s) => ({ ...s, awaitingSpeech: false, speaking: false }));
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
      if (prompt === '') return;
      const clients = ensureClients();
      if (clients === null) return;
      const { tts, llm } = clients;
      const speak = opts?.speak ?? false;
      // Snapshot the companion for this whole turn — its voice, prompt and
      // reasoning behaviour stay consistent even if the ref changes mid-flight.
      const companion = companionRef.current;

      // Commit the user turn the moment it's submitted (ref + state + persist).
      persistThread(appendUser(threadRef.current, prompt, Date.now()));

      // Supersede any in-flight turn (its LLM stream + TTS) before starting.
      turnRef.current?.abort();
      const controller = new AbortController();
      turnRef.current = controller;
      setStatus((s) => ({
        ...s,
        replyText: '',
        replyError: null,
        metrics: { llm: null, tts: null },
        awaitingSpeech: false,
        speaking: false,
      }));
      setReplyPlaying(true);

      void (async (): Promise<void> => {
        // One LLM call: stream deltas into replyText, capture content / reasoning
        // / tool calls / timing, and record the LLM latency. Returns null if the
        // turn was aborted or superseded mid-stream (the caller then bails).
        const runLlm = async (
          messages: LlmMessage[],
          withTools: boolean,
          label: string,
        ): Promise<{
          content: string;
          reasoning: unknown[] | undefined;
          toolCalls: ToolCall[];
        } | null> => {
          let content = '';
          let reasoning: unknown[] | undefined;
          let toolCalls: ToolCall[] = [];
          let completionTokens: number | null = null;
          const start = performance.now();
          let ttftMs: number | null = null;
          let deltas = 0;
          onLogRef.current?.(`LLM ${label}: request sent`, 'send');
          for await (const delta of llm.stream(messages, {
            signal: controller.signal,
            tools: withTools ? toRequestTools(toolsRef.current) : undefined,
            onUsage: (u) => {
              completionTokens = u.completionTokens;
            },
            onReasoning: (d) => {
              reasoning = d;
            },
            onToolCalls: (c) => {
              toolCalls = c;
            },
          })) {
            if (controller.signal.aborted || turnRef.current !== controller) {
              onLogRef.current?.(
                `LLM ${label}: aborted after ${deltas} delta(s)`,
                'info',
              );
              return null;
            }
            if (ttftMs === null) {
              ttftMs = performance.now() - start;
              onLogRef.current?.(`LLM ${label}: first token`, 'recv');
            }
            deltas += 1;
            content += delta;
            setStatus((s) => ({ ...s, replyText: s.replyText + delta }));
          }
          const totalMs = performance.now() - start;
          if (controller.signal.aborted || turnRef.current !== controller) {
            onLogRef.current?.(
              `LLM ${label}: aborted at stream end (${deltas} delta(s))`,
              'info',
            );
            return null;
          }
          onLogRef.current?.(
            `LLM ${label}: complete — ${deltas} delta(s), ${content.length} char(s), ${toolCalls.length} tool call(s)`,
            'recv',
          );
          if (ttftMs !== null) {
            const ttft = ttftMs;
            const decodeSec = Math.max((totalMs - ttft) / 1000, 0.001);
            const tps =
              completionTokens !== null ? completionTokens / decodeSec : null;
            setStatus((s) => ({
              ...s,
              metrics: { ...s.metrics, llm: { ttftMs: ttft, totalMs, tps } },
            }));
          }
          return { content, reasoning, toolCalls };
        };

        // Speak one utterance through TTS, with the awaitingSpeech/speaking
        // stages and metrics. A tool-call turn can speak TWICE — a pre-tool line, then
        // the reaction — so this is factored out. Returns false if the turn was
        // aborted/superseded mid-play (the caller then bails).
        const speakText = async (text: string): Promise<boolean> => {
          const ttsStart = performance.now();
          let ttsTtfbMs: number | null = null;
          // "Waiting for speech" until the first audio bytes arrive.
          setStatus((s) => ({ ...s, awaitingSpeech: true }));
          await tts.play(text, companion.voiceId, controller.signal, () => {
            ttsTtfbMs = performance.now() - ttsStart;
            setStatus((s) => ({ ...s, awaitingSpeech: false, speaking: true }));
          });
          // tts.play resolves even on barge-in/stop, so guard before recording:
          // a superseded turn must not overwrite the current turn's metrics.
          if (controller.signal.aborted || turnRef.current !== controller) {
            return false;
          }
          setStatus((s) => ({
            ...s,
            speaking: false,
            metrics: {
              ...s.metrics,
              tts: {
                ttfbMs: ttsTtfbMs,
                totalMs: performance.now() - ttsStart,
              },
            },
          }));
          return true;
        };

        try {
          // Fill the live markers — the toy status (bottom of the prompt's
          // CONTROL section, the last thing she reads) and the current time.
          const systemPrompt = buildSystemPrompt(
            companion.systemPrompt,
            getDeviceStateRef.current(),
          );
          const baseMessages = toLlmMessages(
            threadRef.current,
            systemPrompt,
            companion.passesReasoning,
          );

          // Call 1 — offer the tools. She may speak, call a tool, or do BOTH: a
          // pre-tool line ("mm, let me get you going") and the call in one turn.
          const r1 = await runLlm(baseMessages, true, 'call-1');
          if (r1 === null) return;

          let reply = r1.content;
          let reasoning = r1.reasoning;

          if (r1.toolCalls.length > 0) {
            // Speak her pre-tool line first, if she said one, BEFORE the device
            // acts — the line plays, THEN the toy starts/changes, THEN her
            // reaction. A barge-in here bails before anything is run or stored.
            if (speak && r1.content.trim() !== '') {
              if (!(await speakText(r1.content))) return;
            }

            // Persist the full agentic sequence: the assistant tool-call turn
            // (content + calls + any Call-1 reasoning) then each tool result
            // linked back by id, committed together so the stored history is
            // always a valid call/result pair. This is also what later turns
            // replay so she sees she has actually called tools before — without
            // it she drifts back to narrating "*starting*" instead of calling.
            let next = appendAssistant(
              threadRef.current,
              r1.content,
              companion.passesReasoning ? r1.reasoning : undefined,
              r1.toolCalls,
              Date.now(),
            );
            for (const call of r1.toolCalls) {
              const tool = toolsRef.current.find((t) => t.name === call.name);
              // Parse the tool-call arguments (`{}` for zero-arg tools like
              // start/stop; e.g. `{ level: "warmup" }` for intensity/edge). A
              // malformed blob runs the tool with no args — the tool validates.
              let args: Record<string, unknown> = {};
              try {
                const parsed: unknown = call.arguments
                  ? JSON.parse(call.arguments)
                  : {};
                if (parsed !== null && typeof parsed === 'object') {
                  args = parsed as Record<string, unknown>;
                }
              } catch {
                // ignore: malformed arguments → run with no args
              }
              // run() returns either the result string or a { result, imageSrc }
              // object (send_picture): normalise to both. imageSrc rides onto
              // the tool turn for rendering; only `result` is fed to the model.
              const raw = tool === undefined ? 'unknown tool' : tool.run(args);
              const result = typeof raw === 'string' ? raw : raw.result;
              const imageSrc =
                typeof raw === 'string' ? undefined : raw.imageSrc;
              onToolRunRef.current?.(call.name, result);
              next = appendTool(
                next,
                call.name,
                result,
                call.id,
                imageSrc,
                Date.now(),
              );
            }
            persistThread(next);
            if (controller.signal.aborted || turnRef.current !== controller) {
              return;
            }

            // Call 2 — feed the tool results back so she reacts to them in
            // words. Rebuilt from the just-persisted thread (which now holds the
            // tool-call turn + results), so the request and the stored history
            // are one and the same. No tools this call: it's her spoken
            // reaction, not a place to chain more actions.
            const call2 = toLlmMessages(
              threadRef.current,
              systemPrompt,
              companion.passesReasoning,
            );
            // The reaction is the second spoken block; clear the streamed
            // pre-tool text so it streams fresh.
            setStatus((s) => ({ ...s, replyText: '' }));
            const r2 = await runLlm(call2, false, 'call-2');
            if (r2 === null) return;
            reply = r2.content;
            reasoning = r2.reasoning;
          }

          // Commit the (final) spoken reply — the reaction when she acted, else
          // her plain reply. reasoning is replayed only when the companion
          // passes it.
          if (reply.trim() !== '') {
            persistThread(
              appendAssistant(
                threadRef.current,
                reply,
                companion.passesReasoning ? reasoning : undefined,
                undefined,
                Date.now(),
              ),
            );
          }
          if (
            controller.signal.aborted ||
            turnRef.current !== controller ||
            reply.trim() === '' ||
            !speak
          ) {
            return;
          }
          if (!(await speakText(reply))) return;
        } catch (e) {
          // Aborted turns land here too; only surface a real failure.
          if (!controller.signal.aborted && turnRef.current === controller) {
            setStatus((s) => ({
              ...s,
              replyError: e instanceof Error ? e.message : 'LLM request failed',
            }));
          }
        } finally {
          // Only clear if this same turn is still active — a newer turn, a
          // barge-in, or Stop may have superseded us before this settled.
          if (turnRef.current === controller) {
            turnRef.current = null;
            setReplyPlaying(false);
            // Catch-all: if TTS resolved without first audio (error/abort) the
            // "waiting for speech" flag would otherwise stick — likewise
            // "speaking" if the audio was cut rather than finishing.
            setStatus((s) => ({
              ...s,
              awaitingSpeech: false,
              speaking: false,
            }));
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
      onPartial: (text) => {
        // Surface the partial (which also locks the composer into dictation)
        // only once this utterance has confirmed real speech — sticky, so
        // trailing partials after the VAD drops mid-sentence still show. An
        // STT phantom arrives on near-silence, never confirms, and is logged
        // instead of taking over the composer.
        speechConfirmedRef.current = confirmSpeech(
          speechConfirmedRef.current,
          text,
          vadSpeakingRef.current,
        );
        if (speechConfirmedRef.current) {
          setStatus((s) => ({ ...s, partial: text }));
        } else {
          onLogRef.current?.(`phantom partial suppressed: "${text}"`, 'info');
        }
        // Barge-in fires here, not on VAD onset: cut the companion off only once
        // the STT has decoded a real word, so raw mic energy (a cough, a thump,
        // her voice leaking past AEC) no longer interrupts her mid-sentence.
        // Barge-in needs BOTH a decoded word AND live mic energy: a partial on
        // its own can be an STT phantom (a token hallucinated on near-silence
        // when the socket opens), which would cut her off mid-reply though no one
        // spoke. Requiring vadSpeaking too means only real speech interrupts her.
        const speechConfirmed = partialHasWord(text) && vadSpeakingRef.current;
        if (isBargeIn(replyPlayingRef.current, speechConfirmed)) {
          onLogRef.current?.(`barge-in: cut reply on "${text}"`, 'info');
          cancelReply();
        }
      },
      onCommitted: (text) => {
        // A committed transcript is a spoken turn: hands-free, so run it as a
        // "say it" (LLM → speak) without waiting on a button. Clear the interim
        // partial — the STT never emits an empty one — so "dictating" releases.
        speechConfirmedRef.current = false;
        setStatus((s) => ({ ...s, committed: text, partial: '' }));
        submitText(text, { speak: true });
      },
      onPhase: (phase) => {
        // Socket closed = utterance over, committed or not: drop the speech
        // confirmation and any uncommitted partial, so a stale partial can't
        // hold the composer in dictation and a past utterance's confirmation
        // can't let the next socket-open phantom through.
        if (phase === 'closed') {
          speechConfirmedRef.current = false;
          setStatus((s) => ({ ...s, phase, partial: '' }));
        } else {
          setStatus((s) => ({ ...s, phase }));
        }
      },
      onServerError: (raw) => {
        onLogRef.current?.(`STT ${raw}`, 'error');
      },
      onClosed: ({ local, code, reason, wasClean }) => {
        // Our own hang-up is expected and already visible as the phase change.
        // One from the far end is the interesting case: it's how an idle
        // socket's death shows up, and the code and reason are all we get.
        if (local) return;
        const why = reason !== '' ? ` ${reason}` : '';
        onLogRef.current?.(
          `STT closed by server: ${code}${why}${wasClean ? '' : ' (unclean)'}`,
          'error',
        );
      },
    });
    sttRef.current = stt;

    void startMic({
      onFrame: (b64) => stt.sendFrame(b64),
      onRms: (rms) => {
        setStatus((s) => ({
          ...s,
          rms,
          preRollFrames: micHandleRef.current?.preRoll.length ?? 0,
          sentFrames: stt.framesSent(),
        }));
      },
      onOnset: () => {
        vadSpeakingRef.current = true;
        // Onset no longer cuts the reply — that waits for a decoded word in
        // onPartial. It starts this utterance streaming, opening the socket
        // first if it's cold, and flushes the pre-roll so the opening word
        // isn't clipped (this is also what starts the audio flowing so a
        // partial can arrive to barge in on).
        stt.beginUtterance(() => micHandleRef.current?.preRoll.flush() ?? []);
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
  }, [ensureClients, submitText, cancelReply]);

  const stop = useCallback((): void => {
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
    speechConfirmedRef.current = false;
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
    previewLlmMessages,
    status,
    audioRef,
  };
}
