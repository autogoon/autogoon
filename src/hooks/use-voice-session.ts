'use client';

// Companions voice-session orchestrator: ties the mic, STT socket, LLM client
// and TTS player into the barge-in loop, with one AbortController per companion
// reply-turn. A turn runs on any text — a committed voice transcript (hands-free,
// auto-spoken) or a typed prompt via submitText — streaming the LLM reply and,
// when asked, speaking it. The mic/STT callbacks are created once (they outlive
// many renders) but must read LIVE values — the current phase, whether a reply is
// playing, the active turn's controller — so everything they touch lives in a
// ref; useState only mirrors the `status` the panel renders. The mic and STT
// wiring is integration code, exercised by driving the panel — the pure
// lifecycle/barge-in decisions live in session-policy.ts and are unit-tested
// there. What a turn commits, and when, is unit-tested against faked LLM and
// TTS boundaries.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Companion } from '@/lib/companions/companions';
import { toRequestTools, type CompanionTool } from '@/lib/companions/tools';
import { stripTextualToolCalls } from '@/lib/llm/textual-tool-calls';
import { AMBIENT_CUE } from '@/lib/companions/ambient';
import { liveStateMessage } from '@/lib/companions/shared-prompt';
import {
  createAmbientScheduler,
  type AmbientScheduler,
} from '@/lib/companions/ambient-scheduler';
import {
  createLlmClient,
  type LlmClient,
  type LlmMessage,
  type ToolCall,
} from '@/lib/llm/client';
import { startMic, VAD_HANGOVER_MS, type MicHandle } from '@/lib/voice/mic';
import { createStt, type Stt } from '@/lib/voice/stt';
import { createTtsPlayer, type TtsPlayer } from '@/lib/voice/tts';
import {
  confirmSpeech,
  isBargeIn,
  partialWordCount,
  type SttPhase,
} from '@/lib/voice/session-policy';
import {
  appendAssistant,
  appendTool,
  appendUser,
  browserTimeZone,
  describeClock,
  parse,
  serialize,
  toLlmMessages,
  type Thread,
  type ThreadTurn,
} from '@/lib/companions/conversation';

export type TurnMetrics = {
  llm: {
    ttftMs: number;
    totalMs: number;
    tps: number | null;
    promptTokens: number | null;
    cachedTokens: number | null;
  } | null;
  tts: { ttfbMs: number | null; totalMs: number } | null;
};

export type VoiceStatus = {
  micOn: boolean;
  phase: SttPhase;
  vadSpeaking: boolean;
  // True from the VAD onset that opens an utterance until the server commits
  // it. The end of speech is ElevenLabs' decision, not ours
  // (commit_strategy=vad), so this is that decision rather than an inference
  // from local mic energy — which dips between words and says nothing about
  // whether you've finished. The composer's dictation lock rides it.
  utteranceOpen: boolean;
  rms: number;
  preRollFrames: number;
  // Frames actually streamed to the STT this session. At FRAME_MS each, this is
  // the audio ElevenLabs bill for — the number to check a session against the
  // usage dashboard, and the one that should stay flat between turns.
  sentFrames: number;
  // Ambient chat's whole state: when the next unprompted turn is due (null when
  // none is pending) and whether the companion is holding off until you speak.
  // Surfaced so the debug tab can show what's coming — otherwise a poke that
  // never comes and a poke that was never armed look identical.
  ambientDueAt: number | null;
  ambientHolding: boolean;
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
  // True while the companion's reply audio is playing: set where awaitingSpeech
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
  // projection as submitText, including gap markers and the trailing live-state
  // message. Debug-only (the panel's request viewer); building it sends
  // nothing.
  previewLlmMessages: () => LlmMessage[];
  status: VoiceStatus;
  audioRef: React.RefObject<HTMLAudioElement | null>;
};

const IDLE_STATUS: VoiceStatus = {
  micOn: false,
  phase: 'closed',
  vadSpeaking: false,
  utteranceOpen: false,
  rms: 0,
  preRollFrames: 0,
  sentFrames: 0,
  ambientDueAt: null,
  ambientHolding: false,
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

// What a worded partial needs before it is believed: either that much voicing
// behind it, or that many words in it (see confirmSpeech — either will do).
// Two sets because the decisions cost different things. A phantom briefly
// showing in the composer is invisible a moment later; cutting the companion
// off mid-reply for a cough is not, so barge-in asks for more voicing.
//
// The voicing figures sit above a transient — the VAD's attack already discards
// anything under 60ms — and under a spoken word, including a clipped "stop".
// Two words is the lowest count that means anything: every phantom seen has
// been a single token, and a real one-word utterance still has voicing to fall
// back on.
const PARTIAL_MIN = { voicedMs: 150, words: 2 };
const BARGE_IN_MIN = { voicedMs: 250, words: 2 };

// An utterance normally ends when the server commits it. This is the failsafe
// for one that never will: a thump crosses the VAD threshold, opens an
// utterance, and no speech follows, so no transcript ever comes back. Without
// it the composer would stay locked until ElevenLabs' own idle close, some
// fourteen seconds later. Generous on purpose — a cold socket has taken two
// seconds to return its first partial, and the cost of firing early is only
// that the lock lifts and re-takes when the transcript lands.
const UTTERANCE_SILENT_TIMEOUT_MS = 2000;

// How a companion ends the ambient loop: called on having said what they
// wanted, or having asked whether you're still there and would rather wait than
// keep talking to an empty room. A tool rather than a marker in the reply
// because a tool call can never be spoken aloud — a marker that escaped the
// stripping would be read out in the companion's voice mid-scene.
//
// It sets a latch rather than skipping one scheduling. A tool call is followed
// by a reaction generation, and the arm at the end of that reaction would
// otherwise undo what the tool just asked for.
const WAIT_FOR_USER_TOOL: CompanionTool = {
  name: 'wait_for_user',
  description:
    "Stop talking and wait for him to speak. Call this when you have nothing more to add for now, or when you've asked whether he's still there and want to leave the next move to him. You'll stay quiet until he says something.",
  run: () => 'waiting for him',
};

// How many times in one turn the companion may be offered the tools. More than
// one because a call often needs a second to be worth anything — search_media
// returns refs that only send_media can act on. Capped because nothing else
// stops a model that answers every round with another call, and a turn that
// never reaches a spoken reply is a companion who has gone silent.
const MAX_TOOL_ROUNDS = 5;

// Persistence key, namespaced per companion so each keeps its own thread.
const threadKeyFor = (companion: Companion): string =>
  `companions:thread:${companion.id}`;

// Everything that changes between two turns, as one system message appended
// after the thread. The persona prompt above it and the whole conversation
// before it are then byte-identical from turn to turn, which is what prompt
// caching needs: providers match a prefix of tokens, so a single volatile value
// early on makes every token after it uncacheable.
const liveState = (deviceState: string): LlmMessage => ({
  role: 'system',
  content: liveStateMessage(
    describeClock(Date.now(), browserTimeZone()),
    deviceState === '' ? 'unknown' : deviceState,
  ),
});

export function useVoiceSession(opts: {
  // The chosen companion — its voice, model and prompt drive the whole turn.
  // Fixed for the life of a play session (the nav lock stops you switching
  // mid-session); changing it reloads that companion's saved thread.
  companion: Companion;
  tools?: CompanionTool[];
  getDeviceState?: () => string;
  // Whether a program is running right now. Ambient chat reads it to pick which
  // set of intervals applies — talking over a running device is a different situation
  // from filling a conversational pause. It never gates whether they speak.
  isPlaying?: () => boolean;
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
  const isPlayingRef = useRef<() => boolean>(opts?.isPlaying ?? (() => false));
  isPlayingRef.current = opts?.isPlaying ?? (() => false);
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
  // The current utterance's voicing, as confirmSpeech's evidence that a partial
  // came from a person rather than a thump. `startedAt` is the live run's onset
  // (0 when quiet); `longestMs` is the longest completed run. Both reset at the
  // utterance boundary, alongside speechConfirmedRef.
  const voicedRunRef = useRef({ startedAt: 0, longestMs: 0 });
  // Watchdog for an utterance that opens on a noise and never produces a
  // transcript; cancelled by the first partial, since anything decoding words
  // will reach a commit.
  const silentUtteranceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endUtterance = useCallback((): void => {
    if (silentUtteranceRef.current !== null) {
      clearTimeout(silentUtteranceRef.current);
      silentUtteranceRef.current = null;
    }
    setStatus((s) => (s.utteranceOpen ? { ...s, utteranceOpen: false } : s));
  }, []);
  // The longest run of voicing so far, live one included — the completed runs
  // alone would ignore the person who is still talking.
  const voicedMs = useCallback((): number => {
    const { startedAt, longestMs } = voicedRunRef.current;
    if (startedAt === 0) return longestMs;
    return Math.max(longestMs, Date.now() - startedAt);
  }, []);
  // The live conversation thread — source of truth, read/written inside the
  // once-created callbacks like the other live refs, mirrored into status.thread.
  // Ambient chat's timer and latch, in one object rather than two more refs
  // here (see ambient-scheduler.ts). Created with the session in start().
  const ambientRef = useRef<AmbientScheduler | null>(null);
  const threadRef = useRef<Thread>([]);

  const setReplyPlaying = useCallback((playing: boolean): void => {
    replyPlayingRef.current = playing;
    setStatus((s) => ({ ...s, replyPlaying: playing }));
  }, []);

  // Write-through persistence: every thread mutation updates the ref, the
  // mirror, and localStorage together. A storage failure (quota, or unavailable)
  // doesn't end the session — the in-memory thread carries on — but it is
  // logged rather than swallowed: nothing else goes wrong until the reload
  // that finds the thread rewound to the last version that fit.
  const persistThread = useCallback((thread: Thread): void => {
    threadRef.current = thread;
    setStatus((s) => ({ ...s, thread }));
    try {
      localStorage.setItem(threadKeyRef.current, serialize(thread));
    } catch (e) {
      onLogRef.current?.(
        `thread not saved: ${e instanceof Error ? e.message : String(e)}`,
        'info',
      );
    }
  }, []);

  const clearThread = useCallback((): void => {
    // A full reset also tears down any live turn, so an in-flight reply can't
    // commit an assistant turn back into the just-cleared thread (mirrors
    // stop()). An already-armed ambient poke would do the same a moment later,
    // so it goes too; nothing re-arms until a turn ends, which needs you to
    // speak first.
    turnRef.current?.abort();
    turnRef.current = null;
    ambientRef.current?.cancel();
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
    const deviceState = getDeviceStateRef.current();
    return [
      ...toLlmMessages(
        threadRef.current,
        companion.systemPrompt,
        companion.passesReasoning,
      ),
      liveState(deviceState),
    ];
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
    ttsRef.current ??= createTtsPlayer(audioEl, (message) => {
      onLogRef.current?.(message, 'error');
    });
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
    (text: string, opts?: { speak?: boolean; ambient?: boolean }): void => {
      const prompt = text.trim();
      // An ambient turn carries no text by design — it answers a silence, not a
      // message — so only a typed or spoken turn has to be non-empty.
      const ambient = opts?.ambient ?? false;
      if (prompt === '' && !ambient) return;
      const clients = ensureClients();
      if (clients === null) return;
      const { tts, llm } = clients;
      const speak = opts?.speak ?? false;
      // Snapshot the companion for this whole turn — its voice, prompt and
      // reasoning behaviour stay consistent even if the ref changes mid-flight.
      const companion = companionRef.current;

      // Commit the user turn the moment it's submitted (ref + state + persist).
      // An ambient turn appends nothing: there is no user turn behind it, and
      // inventing one would mean answering a message you never sent.
      if (!ambient) {
        persistThread(appendUser(threadRef.current, prompt, Date.now()));
        // You spoke, so the loop is live again however it was left, and there is
        // no silence left for a pending poke to fill.
        ambientRef.current?.release();
      }
      ambientRef.current?.cancel();

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
          let promptTokens: number | null = null;
          let cachedTokens: number | null = null;
          const start = performance.now();
          let ttftMs: number | null = null;
          let deltas = 0;
          onLogRef.current?.(`LLM ${label}: request sent`, 'send');
          for await (const delta of llm.stream(messages, {
            signal: controller.signal,
            tools: withTools
              ? toRequestTools([...toolsRef.current, WAIT_FOR_USER_TOOL])
              : undefined,
            onUsage: (u) => {
              completionTokens = u.completionTokens;
              promptTokens = u.promptTokens;
              cachedTokens = u.cachedTokens;
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
              metrics: {
                ...s.metrics,
                llm: { ttftMs: ttft, totalMs, tps, promptTokens, cachedTokens },
              },
            }));
          }
          // Cut out any tool call the model wrote as text: it has already been
          // recovered and dispatched (see textual-tool-calls.ts), so what's left
          // here is markup. Stripped at the single point every caller takes its
          // text from, so neither the transcript nor TTS can ever see it — a
          // spoken turn would otherwise read the tags aloud in the companion's
          // voice.
          return {
            content: stripTextualToolCalls(content),
            reasoning,
            toolCalls,
          };
        };

        // Speak one utterance through TTS, with the awaitingSpeech/speaking
        // stages and metrics. A turn can call this several times: once for each
        // tool round the companion opened with a line, then once for the reply
        // that ends the turn. Returns false if the turn was aborted/superseded
        // mid-play (the caller then bails).
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
          const baseMessages = toLlmMessages(
            threadRef.current,
            companion.systemPrompt,
            companion.passesReasoning,
          );
          // The clock and the toy, last: everything above is identical to last
          // turn's request, which is the whole point (see liveState).
          baseMessages.push(liveState(getDeviceStateRef.current()));
          // An ambient turn has no message to answer: the timer fired, not the
          // user, so the cue stands in for one (see AMBIENT_CUE). It goes after
          // the state, to read as the last thing asked of them, and only on
          // this first request — the tool rounds below rebuild from the thread,
          // which never holds it.
          if (ambient) {
            baseMessages.push({ role: 'system', content: AMBIENT_CUE });
          }

          // The tool rounds. Each offers the tools, and the companion may speak,
          // call a tool, or do BOTH: a pre-tool line ("mm, let me get you
          // going") and the call in one turn. A round they answer with a call
          // runs it and goes round again, because a call's only useful follow-up
          // is often another one. A round they answer with words alone is their
          // reaction, and ends the turn.
          let reply = '';
          let reasoning: unknown[] | undefined;
          // Where the next call reads from: the opening projection, then the
          // thread as each round's results are persisted into it.
          let messages = baseMessages;
          // Set when the cap stops a companion who was still calling, so they
          // are given a last toolless call to say something about what they did.
          let owedReaction = false;

          for (let round = 1; ; round++) {
            const r = await runLlm(messages, true, `call-${round}`);
            if (r === null) return;
            reply = r.content;
            reasoning = r.reasoning;
            if (r.toolCalls.length === 0) break;

            // Speak the pre-tool line first, if the companion said one, BEFORE
            // the device acts — the line plays, THEN the toy starts/changes,
            // THEN their reaction. A barge-in here bails before anything is run
            // or stored.
            if (speak && r.content.trim() !== '') {
              if (!(await speakText(r.content))) return;
            }

            // Persist the full agentic sequence: the assistant tool-call turn
            // (content + calls + any of that call's reasoning) then each tool
            // result linked back by id, committed together so the stored history
            // is always a valid call/result pair. This is also what later turns
            // replay so the companion sees they have actually called tools before —
            // without it they drift back to narrating "*starting*" instead of calling.
            let next = appendAssistant(
              threadRef.current,
              r.content,
              companion.passesReasoning ? r.reasoning : undefined,
              r.toolCalls,
              Date.now(),
            );
            for (const call of r.toolCalls) {
              // wait_for_user is the session's own, not the panel's: it acts on
              // the scheduler rather than the device, so it's dispatched here
              // instead of being looked up among the declared tools.
              const tool =
                call.name === WAIT_FOR_USER_TOOL.name
                  ? {
                      ...WAIT_FOR_USER_TOOL,
                      run: () => {
                        ambientRef.current?.hold();
                        return 'waiting for him';
                      },
                    }
                  : toolsRef.current.find((t) => t.name === call.name);
              // The tool-call arguments arrive as a JSON string. One that won't
              // parse, or that parses to something other than an object, leaves
              // the tool called with none — a tool that takes arguments checks
              // them and returns a refusal instead of acting.
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
              // run() returns either the result string or a { result, mediaRef,
              // display } object: normalise to all three. mediaRef and display
              // ride onto the tool turn for rendering; only `result` is fed to
              // the model.
              const raw = tool === undefined ? 'unknown tool' : tool.run(args);
              const result = typeof raw === 'string' ? raw : raw.result;
              const mediaRef =
                typeof raw === 'string' ? undefined : raw.mediaRef;
              const display = typeof raw === 'string' ? undefined : raw.display;
              onToolRunRef.current?.(call.name, display ?? result);
              next = appendTool(
                next,
                call.name,
                result,
                call.id,
                mediaRef,
                display,
                Date.now(),
              );
            }
            persistThread(next);
            // The pre-tool line now has a turn of its own, so drop the streamed
            // copy: the pending bubble stands for text with nowhere else to
            // render, and the next round streams into it from empty.
            setStatus((s) => ({ ...s, replyText: '' }));
            if (controller.signal.aborted || turnRef.current !== controller) {
              return;
            }

            // Feed the results back by rebuilding from the just-persisted
            // thread (which now holds the tool-call turn + results), so the
            // request and the stored history are one and the same. The toy is
            // read again rather than reused: the round just run may have
            // started, stopped or re-set it, and this line is what the
            // companion is told to trust over everything.
            messages = toLlmMessages(
              threadRef.current,
              companion.systemPrompt,
              companion.passesReasoning,
            );
            messages.push(liveState(getDeviceStateRef.current()));

            if (round === MAX_TOOL_ROUNDS) {
              owedReaction = true;
              break;
            }
          }

          // The cap stopped them mid-chain, so the last word was a tool result
          // rather than anything spoken. One more call, toolless — it can only
          // be the reaction, which is what ends every turn.
          if (owedReaction) {
            const last = await runLlm(messages, false, 'reaction');
            if (last === null) return;
            reply = last.content;
            reasoning = last.reasoning;
          }

          // Commit the (final) spoken reply — the reaction when the companion
          // acted, else their plain reply. reasoning is replayed only when the
          // companion passes it.
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
            // Same as each round's commit: the reply has a bubble now, so the
            // pending one must go before TTS starts.
            setStatus((s) => ({ ...s, replyText: '' }));
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
            // The turn is finished, so line up the next silence-filler. Guarded
            // by the same check as everything else here: a superseded turn —
            // barged in on, or replaced by a newer one — must not arm, or a
            // cut-off reply would leave a poke behind it. The scheduler ignores
            // this if the companion has asked to be left alone.
            ambientRef.current?.arm(companion, isPlayingRef.current());
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

    ambientRef.current = createAmbientScheduler(() => {
      // A poke is an ordinary spoken turn with nothing behind it — same path,
      // same barge-in, same tools. It arms its own successor when it finishes,
      // which is what keeps the loop going without a clock polling for it.
      submitText('', { speak: true, ambient: true });
    });

    const stt = createStt({
      onPartial: (text) => {
        // Words are being decoded, so a commit is coming — the watchdog's job
        // is done and the utterance now ends where it should, at that commit.
        if (silentUtteranceRef.current !== null) {
          clearTimeout(silentUtteranceRef.current);
          silentUtteranceRef.current = null;
        }
        // Surface the partial only once this utterance has confirmed real
        // speech — sticky, so trailing partials after the VAD drops
        // mid-sentence still show. One that never confirms is logged with its
        // evidence instead of taking over the composer.
        const voiced = voicedMs();
        speechConfirmedRef.current = confirmSpeech(
          speechConfirmedRef.current,
          text,
          voiced,
          PARTIAL_MIN,
        );
        if (speechConfirmedRef.current) {
          // You're talking, so a real turn is on its way and there is no silence
          // to fill. Cancelled on the confirmed partial rather than the raw one:
          // a phantom shouldn't be able to call the companion off.
          ambientRef.current?.cancel();
          setStatus((s) => ({ ...s, partial: text }));
        } else {
          // Carries the evidence the decision was made on, not just the verdict:
          // which of "the VAD never saw this speech" and "it saw it and the bar
          // is wrong" is true can't be told apart from the text alone. Named for
          // what happened rather than why — an unconfirmed partial is often
          // perfectly real speech the VAD under-measured, and calling it a
          // phantom sends the reader after the wrong fault.
          const { startedAt, longestMs } = voicedRunRef.current;
          onLogRef.current?.(
            `partial unconfirmed: "${text}" ` +
              `[voiced ${voiced}ms, banked ${longestMs}ms, ` +
              `run ${startedAt === 0 ? 'idle' : `live ${Date.now() - startedAt}ms`}, ` +
              `vad ${vadSpeakingRef.current ? 'on' : 'off'}, ` +
              `words ${partialWordCount(text)}, ` +
              `need ${PARTIAL_MIN.voicedMs}ms or ${PARTIAL_MIN.words} words]`,
            'info',
          );
        }
        // Barge-in fires here, not on VAD onset: cut the companion off only once
        // the STT has decoded a real word, so raw mic energy (a cough, a thump,
        // their voice leaking past AEC) doesn't interrupt them mid-sentence. It
        // is not sticky: each partial is judged on the evidence so far, so a
        // confirmed utterance can't leave a latch set that lets the next
        // hallucinated token through.
        const speechConfirmed = confirmSpeech(
          false,
          text,
          voiced,
          BARGE_IN_MIN,
        );
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
        voicedRunRef.current = { startedAt: 0, longestMs: 0 };
        endUtterance();
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
          voicedRunRef.current = { startedAt: 0, longestMs: 0 };
          // No socket, no utterance — and nothing left that could commit one.
          endUtterance();
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
        // socket closing shows up, and the code and reason are all we get.
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
          ambientDueAt: ambientRef.current?.dueAt() ?? null,
          ambientHolding: ambientRef.current?.holding() ?? false,
        }));
      },
      onOnset: () => {
        vadSpeakingRef.current = true;
        voicedRunRef.current.startedAt = Date.now();
        // The VAD's edges are logged because they are otherwise invisible, and
        // what they measure is not what it looks like: quiet speech dips under
        // the offset threshold repeatedly, so a whole spoken sentence can be
        // credited a fraction of its length. Without these, a transcript that
        // failed to confirm gives no clue whether the mic heard the speaker.
        onLogRef.current?.('voice on', 'info');
        // Onset starts this utterance streaming, opening the socket first if
        // it's cold, and flushes the pre-roll so the opening word isn't clipped
        // — which is also what starts the audio flowing, so a partial can
        // arrive to barge in on. Cutting the reply isn't its job: that waits
        // for a decoded word in onPartial.
        stt.beginUtterance(() => micHandleRef.current?.preRoll.flush() ?? []);
        if (silentUtteranceRef.current !== null) {
          clearTimeout(silentUtteranceRef.current);
        }
        silentUtteranceRef.current = setTimeout(
          endUtterance,
          UTTERANCE_SILENT_TIMEOUT_MS,
        );
        setStatus((s) => ({ ...s, vadSpeaking: true, utteranceOpen: true }));
      },
      onOffset: () => {
        vadSpeakingRef.current = false;
        // Bank the finished run, less the VAD's release tail — the offset lands
        // that long after the voice actually stopped, so the raw span would
        // credit every run with a tenth of a second it didn't have.
        const run = voicedRunRef.current;
        if (run.startedAt !== 0) {
          const heldMs = Date.now() - run.startedAt - VAD_HANGOVER_MS;
          run.longestMs = Math.max(run.longestMs, heldMs);
          run.startedAt = 0;
          onLogRef.current?.(
            `voice off after ${heldMs}ms (longest ${run.longestMs}ms)`,
            'info',
          );
        }
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
  }, [ensureClients, submitText, cancelReply, voicedMs, endUtterance]);

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
    ambientRef.current?.stop();
    ambientRef.current = null;
    replyPlayingRef.current = false;
    vadSpeakingRef.current = false;
    voicedRunRef.current = { startedAt: 0, longestMs: 0 };
    if (silentUtteranceRef.current !== null) {
      clearTimeout(silentUtteranceRef.current);
      silentUtteranceRef.current = null;
    }
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
