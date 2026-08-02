// Companions panel. Two jobs in one panel: (1) the voice session — the mic/STT/
// LLM/TTS loop via useVoiceSession, hosting the <audio> the TTS plays through;
// (2) a device-arming panel — it owns a CompanionEngine and arms/plays the one
// shared Player, so the device runs the companion's program while they talk. One
// companion, a random program on fixed default knobs, on-screen intensity/
// variety controls, and buttons-only device controls (no vosk words — open
// dictation to the companion would otherwise transcribe them).
//
// The presentational pieces live one-per-file beside this index — the
// transcript rows, overlays, chooser card, debug tab and small widgets — while
// everything stateful (hooks, tools, effects, the tab wiring) stays here.
//
// Hot-path note: useVoiceSession returns one `status` object that churns ~50x/s
// while the mic is on; keep the render cheap. The event log is split into a
// memoized child so the rms churn doesn't reconcile it, and the fast loudness
// bar is isolated in <RmsMeter>.

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeft, Menu, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import type { LogEntry } from '@/components/log-card';
import { Segmented } from '@/components/segmented';
import { SessionControls } from '@/components/session-controls';
import { Slider } from '@/components/slider';
import { Sparkline } from '@/components/sparkline';
import { StrokeCard } from '@/components/stroke-card';
import { useGoonpackLibrary } from '@/hooks/use-goonpack-library';
import type { PlayerView } from '@/hooks/use-player';
import { useStrokeControls } from '@/hooks/use-stroke-controls';
import type { VacuglideDeviceController } from '@/hooks/use-vacuglide-device';
import { useVoiceSession } from '@/hooks/use-voice-session';
import {
  companionList,
  type Companion,
  type CompanionMedia,
} from '@/lib/companions/companions';
import {
  isSilentAssistantTurn,
  sameLocalDay,
} from '@/lib/companions/conversation';
import { searchMedia } from '@/lib/companions/media-search';
import {
  countHits,
  describeHits,
  pickMedia,
} from '@/lib/companions/send-media';
import type { CompanionTool } from '@/lib/companions/tools';
import type { LibraryEntry } from '@/lib/goonpacks/entries';
import { voiceStage } from '@/lib/voice/session-policy';
import { PackError } from '@/lib/goonpacks/manifest';
import { resolveDefault, resolveMediaRef } from '@/lib/goonpacks/resolve';
import {
  CompanionEngine,
  type VariabilityLevel,
} from '@/lib/play-modes/companion-engine';
import { ChatBubble } from './chat-bubble';
import {
  ChooserCard,
  SELECTED_VARIANT_PREFIX,
  type PackSel,
} from './chooser-card';
import { DateHeader } from './date-header';
import { ThreadIntro } from './thread-intro';
import { DebugTab } from './debug-tab';
import { JsonOverlay } from './json-overlay';
import { Lightbox } from './lightbox';
import { MediaBubble } from './media-bubble';
import { MissingMediaBubble } from './missing-media-bubble';
import { PlayMenu, type PlayTab } from './play-menu';
import { RmsMeter } from './rms-meter';
import { VoiceStageBubble } from './voice-stage';
import { ToolChip } from './tool-chip';

// Fixed default knobs — the program is random within this baseline. Companions
// open low, with dips to a fraction of that speed; they move both knobs from
// there via their intensity/variety tools. Speed is applied live; variety
// reshapes the dip pattern.
const DEFAULT_INTENSITY = 10;
const DEFAULT_VARIETY: VariabilityLevel = 'medium';

export function CompanionsPanel({
  vacuglide,
  player,
  active,
  view,
  onEnterPlay,
  onExitPlay,
}: {
  vacuglide: VacuglideDeviceController;
  player: PlayerView;
  active: boolean;
  view: 'setup' | 'play';
  onEnterPlay: () => void;
  // Back to the picker (the slim bar's < button) — locked while the program
  // runs, the same nav lock that holds `exit` on every other screen.
  onExitPlay: () => void;
}) {
  const device = vacuglide.player;

  // One index per session, shared with the Goonpacks tab: an import or removal
  // there rebuilds it and this chooser is told, so there is nothing to re-sync
  // when the screen comes back into view.
  const library = useGoonpackLibrary();

  // The picked, fully-resolved companion (variant applied, prompt sections
  // filled). Chosen in the setup view and fixed for the play session (the nav
  // lock stops you returning to the picker mid-session), so it rides in panel
  // state and drives the voice session's persona. Starts on the first
  // built-in's default variant.
  const [companion, setCompanion] = useState<Companion>(() =>
    resolveDefault(companionList[0]!),
  );

  // Setup view: a failed variant pick surfaces here (pack admin — import,
  // remove — lives on the Goonpacks tab).
  const [pickError, setPickError] = useState<string | null>(null);

  // Each card's remembered picks — base version and overlay, stored
  // together as JSON — hydrated from localStorage in an effect (never during
  // render — the panel is server-prerendered).
  const [variantSel, setVariantSel] = useState<Record<string, PackSel>>({});
  useEffect(() => {
    const sel: Record<string, PackSel> = {};
    for (const e of library.entries) {
      const raw = localStorage.getItem(
        SELECTED_VARIANT_PREFIX + e.companion.id,
      );
      if (raw === null) continue;
      try {
        const v: unknown = JSON.parse(raw);
        if (typeof v === 'object' && v !== null) {
          const { base, overlay } = v as Partial<PackSel>;
          sel[e.companion.id] = {
            base: typeof base === 'string' ? base : null,
            overlay: typeof overlay === 'string' ? overlay : null,
          };
        }
      } catch {
        /* a pre-two-select selection — ignore */
      }
    }
    setVariantSel(sel);
  }, [library.entries]);
  const selectPacks = useCallback((companionId: string, sel: PackSel) => {
    setVariantSel((s) => ({ ...s, [companionId]: sel }));
    localStorage.setItem(
      SELECTED_VARIANT_PREFIX + companionId,
      JSON.stringify(sel),
    );
  }, []);

  // The device engine — one instance, owned here. Defined before the voice
  // session because the session's tools/device-state callback both close over
  // it (and the transport below).
  const engineRef = useRef<CompanionEngine | null>(null);
  engineRef.current ??= new CompanionEngine(
    DEFAULT_INTENSITY,
    DEFAULT_VARIETY,
    DEFAULT_VARIETY,
  );
  const engine = engineRef.current;

  // Device transport (the program) — distinct from the mic's start/stop. Also
  // needed before the voice session: the "start"/"stop" tools dispatch here.
  const startProgram = useCallback(() => {
    if (device.source !== engine) device.arm(engine);
    device.play();
  }, [device, engine]);
  const stopProgram = useCallback(() => {
    void device.pause();
  }, [device]);

  // Transition log. Hoisted above the voice session
  // (rather than left with the other status-derived effects below) because
  // its `append` is the tool-dispatch log callback passed into useVoiceSession.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  // Newest last (LogCard auto-scrolls to the bottom); `kind` picks the colour.
  const append = useCallback((text: string, kind = 'send') => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    setLog((l) =>
      [...l, { id: logIdRef.current++, time, text, kind }].slice(-50),
    );
  }, []);

  // Program-shaping knobs, owned here. Declared above the tools / voice session
  // because the intensity/variety tools below drive changeIntensity / changeVariety
  // — one path for both the companion's tool calls and the on-screen controls.
  const [intensity, setIntensity] = useState<number>(DEFAULT_INTENSITY);
  const [variety, setVariety] = useState<VariabilityLevel>(DEFAULT_VARIETY);

  const changeIntensity = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      setIntensity(clamped);
      engine.setSpeedPercent(clamped);
      // Magnitude knob: speed is applied in scale() every tick, so a live
      // refresh() re-sends at the new scale without regenerating the script.
      device.refresh();
      vacuglide.log(`intensity → ${clamped}%`);
    },
    [device, engine, vacuglide],
  );
  const changeVariety = useCallback(
    (level: VariabilityLevel) => {
      setVariety(level);
      // One companion knob over Groove's two shape knobs: how much the pace
      // varies and how deep it dips. Both reshape the generated pattern, so drop
      // the not-yet-played future and regenerate it.
      engine.setVariability(level);
      engine.setDipVariability(level);
      device.invalidateFuture();
      vacuglide.log(`variety → ${level}`);
    },
    [device, engine, vacuglide],
  );

  // The media shown in the lightbox — null when closed. Set when the companion
  // sends media (auto-opens; if it's already open, it swaps to the newest) and
  // when an item in the transcript is clicked.
  const [lightboxMedia, setLightboxMedia] = useState<CompanionMedia | null>(
    null,
  );
  const showMedia = useCallback((m: CompanionMedia) => setLightboxMedia(m), []);

  // What they have already sent, excluded from later searches so a second
  // request on the same topic doesn't return the same picture. Derived from the
  // thread rather than accumulated alongside it — every turn carrying a
  // mediaRef is a send that happened — so a resumed conversation excludes what
  // it sent before the reload, and clearing the thread clears these with it.
  // A ref because the tool closures outlive the render that made them; the
  // effect below is what keeps it current.
  const sentRefs = useRef<Set<string>>(new Set());

  // The tools the companion can call, and the live device-state line injected each turn.
  // Return type annotated on the callback (not via useMemo's generic) so each
  // array element is checked against CompanionTool individually — otherwise TS's
  // array-literal inference merges the differently-shaped `intensity`/`variety`
  // `parameters.properties` into one shape before the check, and fails.
  const tools = useMemo((): CompanionTool[] => {
    // The companion's media, if any. Empty → both media tools are left out
    // entirely, so a companion with no media never offers them.
    const items = companion.media ?? [];
    return [
      {
        name: 'start',
        description:
          'Start the toy for the user — actually makes it begin. Call this whenever you want the toy to start.',
        run: () => {
          startProgram();
          return 'started';
        },
      },
      {
        name: 'stop',
        description:
          'Stop the toy — actually pauses it. Call this whenever you want the toy to stop.',
        run: () => {
          stopProgram();
          return 'stopped';
        },
      },
      {
        name: 'intensity',
        description:
          "Set how hard and fast the toy drives him, as a percentage from 0 (off) to 100 (relentless). Call this to make it more or less intense; pass the percent you're going to. Read the current level from the toy status first, then move up or down from there. Narrate it however you like — 'faster', 'more intense' — but the tool is what actually changes it.",
        parameters: {
          type: 'object',
          properties: {
            percent: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: '0 = off, 100 = hardest/fastest',
            },
          },
          required: ['percent'],
        },
        run: (args) => {
          const percent = args.percent;
          if (typeof percent !== 'number' || Number.isNaN(percent)) {
            return `invalid intensity: ${String(percent)}`;
          }
          changeIntensity(percent);
          return `intensity → ${Math.max(0, Math.min(100, Math.round(percent)))}%`;
        },
      },
      {
        name: 'variety',
        description:
          'Set how much the toy varies and teases — how much it mixes up the pace and pulls back into long slow dips before climbing again, versus a steadier drive. Levels: off, low, medium, high. Call this to make it more teasing and restless, or calmer and steadier.',
        parameters: {
          type: 'object',
          properties: {
            level: {
              type: 'string',
              enum: ['off', 'low', 'medium', 'high'],
              description:
                'off = steady drive, high = lots of teasing variation',
            },
          },
          required: ['level'],
        },
        run: (args) => {
          const level = args.level;
          if (
            level !== 'off' &&
            level !== 'low' &&
            level !== 'medium' &&
            level !== 'high'
          ) {
            return `invalid variety: ${String(level)}`;
          }
          changeVariety(level);
          return `variety → ${level}`;
        },
      },
      // The media tools — only when the companion has media. They ask in words,
      // the app searches, and they send one of the refs it hands back. Nothing
      // lists the whole set: send_media's run() resolves the ref to an item,
      // opens the lightbox, and returns that ref so it renders inline in the
      // transcript too.
      ...(items.length > 0
        ? [
            {
              name: 'search_media',
              description:
                'Look through your own pictures and videos for ones matching a description — "me on my knees looking up", "something on a beach". Optionally pass `kind` to search only pictures or only videos. Returns up to a couple of dozen matches, each with a ref and what it shows. Call this before send_media; the refs it returns are what send_media takes.',
              parameters: {
                type: 'object',
                properties: {
                  description: {
                    type: 'string',
                    description:
                      'what you want a picture of, in your own words',
                  },
                  kind: {
                    type: 'string',
                    enum: ['picture', 'video'],
                    description:
                      'optional: search only this sort; omit to search both',
                  },
                },
                required: ['description'],
              },
              run: (args: Record<string, unknown>) => {
                const query =
                  typeof args.description === 'string' ? args.description : '';
                // 'picture' is the word the companion is given for a still;
                // MediaKind calls it 'image'. Anything else is no filter — a
                // model writing the call out as text can put anything here, and
                // searching both beats refusing.
                const kind =
                  args.kind === 'picture'
                    ? 'image'
                    : args.kind === 'video'
                      ? 'video'
                      : undefined;
                const found = searchMedia(items, query, {
                  exclude: sentRefs.current,
                  kind,
                });
                return {
                  result: describeHits(found),
                  display: countHits(found),
                };
              },
            } satisfies CompanionTool,
            {
              name: 'send_media',
              description:
                'Send him one of your pictures or videos, shown to him right now in the call. Pass `ref` — one of the refs search_media returned. Search first; a ref you made up sends nothing.',
              parameters: {
                type: 'object',
                properties: {
                  ref: {
                    type: 'string',
                    description: 'a ref from search_media',
                  },
                },
                required: ['ref'],
              },
              run: (args: Record<string, unknown>) => {
                const pick = pickMedia(items, args);
                if (pick.show !== null) {
                  sentRefs.current.add(pick.show.ref);
                  showMedia(pick.show);
                }
                return pick.sent;
              },
            } satisfies CompanionTool,
          ]
        : []),
    ];
  }, [
    startProgram,
    stopProgram,
    changeIntensity,
    changeVariety,
    companion.media,
    showMedia,
  ]);

  // Is the toy running *this* panel's program? The source guard matters
  // because the Player holds one engine at a time — asking only about the
  // state would answer for whoever else is armed.
  const isRunning = useCallback(
    () => player.source === engine && player.state === 'playing',
    [player.source, player.state, engine],
  );

  // The toy's state in plain terms — connection, whether it's actually running
  // (running implies connected), and the current intensity/variety levels. This
  // is the ground-truth line the companion reads each turn; the level is here (not just
  // in their tool history) so they stay in sync when the knobs are changed
  // manually. No "program" (in-app jargon).
  const getDeviceState = useCallback((): string => {
    const levels = `It's set to ${intensity}% intensity with ${variety} variety.`;
    if (!vacuglide.connected) {
      return `The toy is not connected and is not running. ${levels}`;
    }
    const status = isRunning()
      ? 'The toy is connected and running.'
      : 'The toy is connected and not running.';
    return `${status} ${levels}`;
  }, [vacuglide.connected, isRunning, intensity, variety]);

  const {
    start: startListening,
    stop: stopListening,
    submitText,
    cancelReply,
    clearThread,
    previewLlmMessages,
    status,
    audioRef,
  } = useVoiceSession({
    companion,
    tools,
    getDeviceState,
    isPlaying: isRunning,
    onToolRun: (name, result) => append(`tool: ${name} → ${result}`, 'hit'),
    onLog: (text, kind) => append(text, kind),
  });

  // Re-read the exclusions from the thread whenever it changes — a load, a
  // send, or a clear. send_media also adds its ref as it sends, because a model
  // can search again in the same turn, before the turn carrying that send has
  // been appended.
  useEffect(() => {
    sentRefs.current = new Set(
      status.thread.flatMap((turn) =>
        turn.role === 'tool' && turn.mediaRef !== undefined
          ? [turn.mediaRef]
          : [],
      ),
    );
  }, [status.thread]);

  // Manual stroke state only — its `keywords` are intentionally NOT wired to
  // voice (Companions registers no vosk words).
  const stroke = useStrokeControls(vacuglide, player);

  const isCurrent = player.source === engine;
  const state = isCurrent ? player.state : 'armed';

  // Arm the engine when the play view is up and the Player is free — mirrors
  // Autopilot. Picking a companion on the chooser arms directly too (see
  // enterPlay); arm() is idempotent, so at most one harmless re-arm happens
  // before the player-view mirror catches up. The setup view itself renders no
  // device side effects.
  useEffect(() => {
    if (
      active &&
      view === 'play' &&
      player.state === 'armed' &&
      player.source !== engine
    ) {
      device.arm(engine);
    }
  }, [active, view, player.state, player.source, device, engine]);

  // A hot mic must not linger once you leave Companions. stop() is idempotent.
  useEffect(() => {
    if (!active) stopListening();
  }, [active, stopListening]);

  const reset = useCallback(() => {
    setIntensity(DEFAULT_INTENSITY);
    engine.setSpeedPercent(DEFAULT_INTENSITY);
    setVariety(DEFAULT_VARIETY);
    engine.setVariability(DEFAULT_VARIETY);
    engine.setDipVariability(DEFAULT_VARIETY);
    device.arm(engine);
  }, [device, engine]);

  const enterPlay = useCallback(() => {
    device.arm(engine);
    onEnterPlay();
  }, [device, engine, onEnterPlay]);

  // Resolve a chooser card's pick and enter play; a failure surfaces on the
  // setup view.
  const { resolveVariant } = library;
  const pickVariant = useCallback(
    (
      entry: LibraryEntry,
      baseKey: string | null,
      overlayKey: string | null,
    ) => {
      void (async () => {
        try {
          const resolved = await resolveVariant(entry, baseKey, overlayKey);
          if (resolved === null) return; // overtaken by a newer pick
          setCompanion(resolved);
          enterPlay();
        } catch (e) {
          setPickError(
            e instanceof PackError ? e.message : 'pack failed to load',
          );
        }
      })();
    },
    [resolveVariant, enterPlay],
  );

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, 'error'),
    [vacuglide],
  );

  const prevPhase = useRef(status.phase);
  useEffect(() => {
    if (status.phase !== prevPhase.current) {
      prevPhase.current = status.phase;
      append(`STT ${status.phase}`, 'info');
    }
  }, [status.phase, append]);

  const prevCommitted = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommitted.current) {
      prevCommitted.current = status.committed;
      if (status.committed !== '')
        append(`heard: "${status.committed}"`, 'hit');
    }
  }, [status.committed, append]);

  const prevReply = useRef(status.replyPlaying);
  useEffect(() => {
    if (status.replyPlaying !== prevReply.current) {
      prevReply.current = status.replyPlaying;
      append(status.replyPlaying ? 'reply started' : 'reply ended');
    }
  }, [status.replyPlaying, append]);

  const [text, setText] = useState('');
  // A final (committed) transcript is added to the chat by the voice session,
  // so clear the composer rather than dropping the transcript back into it.
  const prevCommittedForBox = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommittedForBox.current) {
      prevCommittedForBox.current = status.committed;
      if (status.committed !== '') setText('');
    }
  }, [status.committed]);

  // True while the user is dictating: the composer shows the live partial and
  // is locked. It runs from the VAD onset that opens an utterance to the point
  // the server commits it — a decision about speech, not about mic energy, so
  // it doesn't blink between words the way the raw VAD does and needs no
  // debouncing. `partial` is redundant with it, and kept because text on screen
  // should never sit in an unlocked box.
  const dictating = status.utteranceOpen || status.partial !== '';

  // The session's live stage, shared by the lightbox badge and the
  // transcript's stage bubble.
  const stage = voiceStage(status);

  // In-progress reply bubble: the streamed text that has no turn of its own
  // yet. Every commit clears replyText, so this is exactly what is unstored —
  // a pre-tool line in any tool round included, since those are spoken before
  // the round they belong to is written.
  const pendingReplyVisible =
    status.replyPlaying && status.replyText.trim() !== '';

  // From the moment the companion's words are headed for the speaker, their most
  // recent turn wears the shimmer instead of a status row — faint while the
  // voice loads, stronger once they're speaking.
  const voice =
    stage === 'tts' ? 'warming' : stage === 'speaking' ? 'speaking' : undefined;

  // Which bubble wears it: the pending one if the reply hasn't committed yet,
  // otherwise the last assistant turn that actually rendered a bubble — a
  // silent media turn has none, so the marker falls back past it.
  const voicedFromEnd = [...status.thread]
    .reverse()
    .findIndex((t) => t.role === 'assistant' && !isSilentAssistantTurn(t));
  const voicedIndex =
    voice !== undefined && !pendingReplyVisible && voicedFromEnd !== -1
      ? status.thread.length - 1 - voicedFromEnd
      : -1;

  // Play-view sub-tabs, switched from the hamburger menu. Session (mic +
  // conversation) opens first.
  const [tab, setTab] = useState<PlayTab>('session');
  const [menuOpen, setMenuOpen] = useState(false);
  // The LLM request viewer: the pretty-printed JSON of the exact request a
  // turn sent right now would make, or null when closed. Snapshotted on click,
  // not live.
  const [llmRequestJson, setLlmRequestJson] = useState<string | null>(null);
  const showLlmRequest = useCallback(
    () => setLlmRequestJson(JSON.stringify(previewLlmMessages(), null, 2)),
    [previewLlmMessages],
  );

  // Where the transcript's date headers go: turn index → that turn's `at`, on
  // the first stamped turn and wherever the local day changes from the last
  // stamped turn before it. Un-stamped turns (threads stored before timestamps
  // existed) never make or break a day.
  const dateHeaderAts = useMemo(() => {
    const headers = new Map<number, number>();
    let prevAt: number | undefined;
    status.thread.forEach((turn, i) => {
      if (turn.at === undefined) return;
      if (prevAt === undefined || !sameLocalDay(prevAt, turn.at)) {
        headers.set(i, turn.at);
      }
      prevAt = turn.at;
    });
    return headers;
  }, [status.thread]);
  // The pinned program preview (Sparkline + Reset) — toggled from the
  // hamburger menu, off by default.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Keep the chat transcript scrolled to the newest message/streamed reply.
  // Also fires on `view`/`tab` so opening a companion with saved history (the
  // transcript mounting fresh) lands at the bottom, not the top. useLayoutEffect
  // so the jump happens before paint — no flash of the top on entry.
  const messagesRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [
    view,
    tab,
    status.thread,
    status.replyText,
    status.replyPlaying,
    status.awaitingSpeech,
  ]);

  // Focus the composer when the chat becomes visible (on load / entering Play).
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (active && view === 'play' && tab === 'session') {
      composerRef.current?.focus();
    }
  }, [active, view, tab]);

  // What the composer displays: the live transcript while dictating, otherwise
  // whatever's been typed.
  const composerValue = dictating ? status.partial : text;

  // Grow the box to fit, so a long sentence — dictated or typed — isn't hidden
  // below the fold of a fixed-height box. Collapsing to `auto` before measuring
  // is what makes it able to shrink again: scrollHeight can only report content
  // taller than the current height, never shorter. Layout effect so the
  // resize lands in the same frame as the text and the box doesn't visibly
  // jump. It stops growing at max-h and scrolls, so a long dictation can't
  // squeeze the conversation above it off the screen.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (el === null) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [composerValue]);

  const connected = vacuglide.connected;

  return (
    <Panel>
      {/* TTS element — rendered once, in both views, so audioRef stays stable. */}
      <audio ref={audioRef} className="hidden" />

      {/* Lightbox for sent media — above everything, in either view. */}
      {lightboxMedia !== null && (
        <Lightbox
          media={lightboxMedia}
          stage={stage}
          onClose={() => setLightboxMedia(null)}
        />
      )}

      {/* The Debug tab's LLM request viewer. */}
      {llmRequestJson !== null && (
        <JsonOverlay
          json={llmRequestJson}
          onClose={() => setLlmRequestJson(null)}
        />
      )}

      {view === 'setup' ? (
        <>
          <Card title="Companions">
            <p>
              Choose a companion. They listen, reply in their own voice, and run
              the device while you talk — cut in any time and they stop.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {library.status === 'loading' ? (
                <p>Checking packs…</p>
              ) : (
                library.entries.map((entry) => (
                  <ChooserCard
                    key={entry.companion.id}
                    entry={entry}
                    sel={variantSel[entry.companion.id]}
                    onSelectPacks={selectPacks}
                    onPick={pickVariant}
                  />
                ))
              )}
            </div>
            {pickError !== null && (
              <p className="mt-1 text-sm text-red-500">{pickError}</p>
            )}
          </Card>

          <Card title="Privacy">
            Unlike the rest of Autogoon, Companions sends data off your device:
            your speech is transcribed by{' '}
            <span className="font-bold">ElevenLabs</span>, and replies are
            generated by an LLM through{' '}
            <span className="font-bold">OpenRouter</span> (routed to the fastest
            available provider). The conversation is stored in this browser.
          </Card>
        </>
      ) : (
        // Viewport-height column: the slim bar (and the preview, when toggled
        // on) is fixed height and the active tab's content flexes — so the
        // conversation shrinks rather than the composer being pushed off the
        // bottom. The app chrome (header, breadcrumb) is hidden on this
        // screen (page.tsx), so this column owns the viewport.
        <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col gap-3">
          {/* The slim bar — all that's left of the chrome: back to the picker
              (locked while the program runs, the same nav lock as every other
              screen), the
              mic with its loudness sliver, and the hamburger. */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={onExitPlay}
              disabled={player.state !== 'armed'}
              aria-label="Back to the picker"
              title={
                player.state !== 'armed'
                  ? 'Stop the session first'
                  : 'Back to the picker'
              }
              className="flex items-center justify-center p-2"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <div className="flex-1" />
            {status.micOn && (
              <div className="w-16">
                <RmsMeter rms={status.rms} speaking={status.vadSpeaking} />
              </div>
            )}
            <Button
              onClick={() =>
                status.micOn ? stopListening() : startListening()
              }
              aria-label={status.micOn ? 'Stop listening' : 'Start listening'}
              title={status.micOn ? 'Stop listening' : 'Start listening'}
              className={`flex shrink-0 items-center justify-center p-2 ${
                status.micOn
                  ? ''
                  : 'border-blue-600 bg-blue-600 text-white enabled:hover:bg-blue-700'
              }`}
            >
              {status.micOn ? (
                <MicOff className="size-5" />
              ) : (
                <Mic className="size-5" />
              )}
            </Button>
            <div className="relative">
              <Button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                className="flex items-center justify-center p-2"
              >
                <Menu className="size-5" />
              </Button>
              {menuOpen && (
                <PlayMenu
                  tab={tab}
                  onSelectTab={setTab}
                  previewOpen={previewOpen}
                  onTogglePreview={() => setPreviewOpen((o) => !o)}
                  onShowLlmRequest={showLlmRequest}
                  onClose={() => setMenuOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Program preview, when toggled on from the menu. */}
          {previewOpen && (
            <Card className="shrink-0">
              <div className="mb-2 flex justify-end">
                <Button onClick={reset} className="py-1 text-xs">
                  Reset
                </Button>
              </div>
              <Sparkline
                points={player.upcoming.speed}
                valves={player.upcoming.valves}
              />
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>now</span>
                <span>+60s</span>
              </div>
            </Card>
          )}

          {tab === 'controls' && (
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
              <SessionControls
                state={state}
                connected={connected}
                onStart={startProgram}
                onStop={stopProgram}
                onReset={reset}
                showReset={false}
              />

              <StrokeCard
                strokeDisabled={!stroke.canStroke}
                strokePulsing={stroke.strokePulsing}
                onValvePlus={vacuglide.valvePlus}
                onValveMinus={vacuglide.valveMinus}
                onError={logError}
                voice={false}
              />

              {/* On-screen program-shape controls. */}
              <Card title="Intensity">
                <div className="text-muted-foreground flex justify-between text-sm">
                  <span>Ceiling</span>
                  <span className="tabular-nums">{intensity}%</span>
                </div>
                <Slider
                  value={intensity}
                  min={0}
                  max={100}
                  step={5}
                  onChange={changeIntensity}
                />
              </Card>

              <Card title="Variety">
                <Segmented
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'low', label: 'Low' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'high', label: 'High' },
                  ]}
                  value={variety}
                  onChange={changeVariety}
                  activeClass="bg-purple-600 text-white"
                  // No vosk grammar here, so nothing can fall out of step with
                  // it; the control is always available.
                  disabled={false}
                />
              </Card>
            </div>
          )}

          {tab === 'session' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <Card fill className="pt-4">
                {/* Scrolling transcript — fills the space; newest at the bottom
                    (auto-scrolled via messagesRef). */}
                <div
                  ref={messagesRef}
                  className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
                >
                  <ThreadIntro text={companion.intro} />
                  {status.thread.map((turn, i) => {
                    let row: ReactNode;
                    if (turn.role === 'tool') {
                      // Media the companion sent renders as a clickable
                      // thumbnail; any other tool call as the little action chip.
                      if (turn.mediaRef !== undefined) {
                        const item = resolveMediaRef(
                          turn.mediaRef,
                          companion.media,
                        );
                        row =
                          item === null ? (
                            <MissingMediaBubble />
                          ) : (
                            <MediaBubble
                              media={item}
                              onOpen={() => showMedia(item)}
                            />
                          );
                      } else {
                        row = (
                          <ToolChip
                            name={turn.name}
                            result={turn.display ?? turn.result}
                          />
                        );
                      }
                    } else if (isSilentAssistantTurn(turn)) {
                      // The companion called a tool without saying anything: no
                      // bubble — the tool chip or media that follows is the record.
                      row = null;
                    } else {
                      row = (
                        <ChatBubble
                          role={turn.role}
                          text={turn.content}
                          at={turn.at}
                          voice={i === voicedIndex ? voice : undefined}
                        />
                      );
                    }
                    return (
                      <Fragment key={i}>
                        {dateHeaderAts.get(i) !== undefined && (
                          <DateHeader at={dateHeaderAts.get(i)!} />
                        )}
                        {row}
                      </Fragment>
                    );
                  })}
                  {pendingReplyVisible && (
                    <ChatBubble
                      role="assistant"
                      text={status.replyText}
                      pending
                      voice={voice}
                    />
                  )}
                  {status.thread.length === 0 && !status.replyPlaying && (
                    <p>No messages yet.</p>
                  )}
                  {/* Live stage as a chat-style bubble, for the stages with no
                  message on screen yet. Once one exists the
                  message carries the state itself: the pending bubble while the
                  reply streams into it, then its shimmer through voice-loading
                  and speaking. */}
                  {!(stage === 'streaming' && pendingReplyVisible) && (
                    <VoiceStageBubble stage={stage} />
                  )}
                </div>

                {/* Composer — pinned at the bottom. */}
                <div className="shrink-0 space-y-2 border-t pt-2">
                  {status.replyError !== null && (
                    <p className="text-sm text-red-500">
                      Error: {status.replyError}
                    </p>
                  )}
                  {/* The ring mirrors the one on a message the companion is
                      speaking: theirs shimmers while they talk, the composer
                      while the mic is open. It rides the wrapper because a textarea
                      can't carry the pseudo-element that draws it, and because
                      the ring shouldn't dim with the disabled box inside. */}
                  <div
                    className={`rounded-lg ${
                      dictating
                        ? 'border-shimmer [--shimmer-color:var(--foreground)]'
                        : ''
                    }`}
                  >
                    <textarea
                      ref={composerRef}
                      value={composerValue}
                      disabled={dictating}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter says it (speaks the reply); Shift+Enter inserts
                        // a newline.
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (text.trim() !== '' && !status.replyPlaying) {
                            submitText(text, { speak: true });
                            setText('');
                          }
                        }
                      }}
                      placeholder={
                        dictating ? 'Listening…' : 'Type a message, or speak…'
                      }
                      className="bg-foreground/5 text-foreground block max-h-40 min-h-16 w-full resize-none overflow-y-auto rounded-lg p-2 disabled:opacity-70"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        submitText(text, { speak: false });
                        setText('');
                      }}
                      disabled={
                        dictating || text.trim() === '' || status.replyPlaying
                      }
                    >
                      Send
                    </Button>
                    <Button
                      onClick={() => {
                        submitText(text, { speak: true });
                        setText('');
                      }}
                      disabled={
                        dictating || text.trim() === '' || status.replyPlaying
                      }
                      className="text-foreground bg-blue-600"
                    >
                      Say it
                    </Button>
                    <Button
                      onClick={cancelReply}
                      disabled={!status.replyPlaying}
                    >
                      Stop
                    </Button>
                    <Button
                      onClick={clearThread}
                      disabled={
                        status.replyPlaying || status.thread.length === 0
                      }
                    >
                      Clear
                    </Button>
                    <span className="text-muted-foreground self-center text-sm">
                      {status.replyPlaying ? 'working…' : 'idle'}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {tab === 'debug' && (
            <DebugTab
              status={status}
              log={log}
              vacuglide={vacuglide}
              onShowLlmRequest={showLlmRequest}
            />
          )}
        </div>
      )}
    </Panel>
  );
}
