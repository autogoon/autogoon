"use client";

// Companions panel. Two jobs in one panel: (1) the voice session — the mic/STT/
// LLM/TTS loop via useVoiceSession, hosting the <audio> the TTS plays through;
// (2) a device-arming panel — it owns a CompanionEngine and arms/plays the one
// shared Player, so the device runs Elise's program while she talks. One
// companion, a random program on fixed default knobs, on-screen intensity/
// variety controls, and buttons-only device controls (no vosk words — open
// dictation to Elise would otherwise transcribe them).
//
// Hot-path note: useVoiceSession returns one `status` object that churns ~50x/s
// while the mic is on; keep the render cheap. The event log is split into a
// memoized child so the rms churn doesn't reconcile it, and the fast loudness
// bar is isolated in <RmsMeter>.

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight, Cog, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { LogCard, type LogEntry } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { Segmented } from "@/components/segmented";
import { SessionControls } from "@/components/session-controls";
import { Slider } from "@/components/slider";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { useVoiceSession } from "@/hooks/use-voice-session";
import {
  COMPANIONS,
  companionList,
  type CompanionId,
} from "@/lib/companions/companions";
import type { CompanionTool } from "@/lib/companions/tools";
import {
  CompanionEngine,
  type VariabilityLevel,
} from "@/lib/algorithms/companion-engine";

// Fixed default knobs — the program is random within this baseline. Companions
// start gentle: a low-intensity, lightly-varying program. Elise turns it up from
// there via her intensity/variety tools. Speed is applied live; variety reshapes
// the dip pattern.
const DEFAULT_INTENSITY = 20;
const DEFAULT_VARIETY: VariabilityLevel = "low";

// The session's fast-moving loudness bar — repaints every frame; kept small.
function RmsMeter({ rms, speaking }: { rms: number; speaking: boolean }) {
  const pct = Math.min(100, Math.round(rms * 500));
  return (
    <div className="bg-foreground/10 h-2 w-full overflow-hidden rounded">
      <div
        className={`h-full ${speaking ? "bg-emerald-500" : "bg-foreground/30"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// The event log reuses the shared LogCard (monospace, timestamped, colour-by-
// kind, auto-scrolling, dev-only) so it matches the other algorithms' logs.
// Memoized on its entries so the ~50 Hz rms churn doesn't reconcile it.
const EventLog = memo(function EventLog({ entries }: { entries: LogEntry[] }) {
  return <LogCard title="Events" entries={entries} />;
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

// A small inline "in progress" spinner for the pending LLM / TTS states.
function Spinner() {
  return (
    <span
      role="status"
      aria-label="loading"
      className="border-foreground/30 border-t-foreground inline-block h-3 w-3 animate-spin rounded-full border-2"
    />
  );
}

// One transcript row: user turns right-aligned in the accent colour, Elise's
// left-aligned and muted. `pending` dims the in-progress reply until it folds
// into the thread.
function ChatBubble({
  role,
  text,
  pending = false,
}: {
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "bg-blue-600 text-white" : "bg-foreground/10"
        } ${pending ? "opacity-70" : ""}`}
      >
        {/* Trim leading/trailing whitespace (M3 often opens with a blank line)
            while keeping internal paragraph breaks under whitespace-pre-wrap. */}
        {text.trim()}
      </div>
    </div>
  );
}

// A centered "action" chip marking a tool call Elise made (start/stop), so it's
// visible in the transcript whether she actually called it.
function ToolChip({ name, result }: { name: string; result: string }) {
  return (
    <div className="flex justify-center">
      <span className="text-muted-foreground bg-foreground/5 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs">
        <Cog className="size-3" />
        {name} → {result}
      </span>
    </div>
  );
}

export function CompanionsPanel({
  vacuglide,
  player,
  active,
  view,
  onEnterPlay,
}: {
  vacuglide: VacuglideDeviceController;
  player: PlayerView;
  active: boolean;
  view: "setup" | "play";
  onEnterPlay: () => void;
}) {
  const device = vacuglide.player;

  // The picked companion. Chosen in the setup view and fixed for the play
  // session (the nav lock stops you returning to the picker mid-session), so it
  // rides in panel state and drives the voice session's persona. Starts on the
  // first companion in the list; the picker recolours per accent, so there's no
  // "default" beyond a valid starting selection.
  const [companionId, setCompanionId] = useState<CompanionId>(
    companionList[0]!.id,
  );
  const companion = COMPANIONS[companionId];

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

  // Transition log for the acceptance run. Hoisted above the voice session
  // (rather than left with the other status-derived effects below) because
  // its `append` is the tool-dispatch log callback passed into useVoiceSession.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  // Newest last (LogCard auto-scrolls to the bottom); `kind` picks the colour.
  const append = useCallback((text: string, kind = "send") => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    setLog((l) =>
      [...l, { id: logIdRef.current++, time, text, kind }].slice(-50),
    );
  }, []);

  // Program-shaping knobs, owned here. Declared above the tools / voice session
  // because the intensity/variety tools below drive changeIntensity / changeVariety
  // — one path for both her tool calls and the on-screen controls.
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

  // The tools Elise can call, and the live device-state line injected each turn.
  // Return type annotated on the callback (not via useMemo's generic) so each
  // array element is checked against CompanionTool individually — otherwise TS's
  // array-literal inference merges the differently-shaped `intensity`/`variety`
  // `parameters.properties` into one shape before the check, and fails.
  const tools = useMemo(
    (): CompanionTool[] => [
      {
        name: "start",
        description:
          "Start the toy for the user — actually makes it begin. Call this whenever you want the toy to start.",
        run: () => {
          startProgram();
          return "started";
        },
      },
      {
        name: "stop",
        description:
          "Stop the toy — actually pauses it. Call this whenever you want the toy to stop.",
        run: () => {
          stopProgram();
          return "stopped";
        },
      },
      {
        name: "intensity",
        description:
          "Set how hard and fast the toy drives him, as a percentage from 0 (off) to 100 (relentless). Call this to make it more or less intense; pass the percent you're going to. Read the current level from the toy status first, then move up or down from there. Narrate it however you like — 'faster', 'more intense' — but the tool is what actually changes it.",
        parameters: {
          type: "object",
          properties: {
            percent: {
              type: "integer",
              minimum: 0,
              maximum: 100,
              description: "0 = off, 100 = hardest/fastest",
            },
          },
          required: ["percent"],
        },
        run: (args) => {
          const percent = args.percent;
          if (typeof percent !== "number" || Number.isNaN(percent)) {
            return `invalid intensity: ${String(percent)}`;
          }
          changeIntensity(percent);
          return `intensity → ${Math.max(0, Math.min(100, Math.round(percent)))}%`;
        },
      },
      {
        name: "variety",
        description:
          "Set how much the toy varies and teases — how much it mixes up the pace and pulls back into long slow dips before climbing again, versus a steadier drive. Levels: off, low, medium, high. Call this to make it more teasing and restless, or calmer and steadier.",
        parameters: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["off", "low", "medium", "high"],
              description:
                "off = steady drive, high = lots of teasing variation",
            },
          },
          required: ["level"],
        },
        run: (args) => {
          const level = args.level;
          if (
            level !== "off" &&
            level !== "low" &&
            level !== "medium" &&
            level !== "high"
          ) {
            return `invalid variety: ${String(level)}`;
          }
          changeVariety(level);
          return `variety → ${level}`;
        },
      },
    ],
    [startProgram, stopProgram, changeIntensity, changeVariety],
  );

  // The toy's state in plain terms — connection, whether it's actually running
  // (running implies connected), and the current intensity/variety levels. This
  // is the ground-truth line Elise reads each turn; the level is here (not just
  // in her tool history) so she stays in sync when the knobs are changed
  // manually. No "program" (in-app jargon).
  const getDeviceState = useCallback((): string => {
    const levels = `It's set to ${intensity}% intensity with ${variety} variety.`;
    if (!vacuglide.connected) {
      return `The toy is not connected and is not running. ${levels}`;
    }
    const running = player.source === engine && player.state === "playing";
    const status = running
      ? "The toy is connected and running."
      : "The toy is connected and not running.";
    return `${status} ${levels}`;
  }, [
    vacuglide.connected,
    player.source,
    player.state,
    engine,
    intensity,
    variety,
  ]);

  const {
    start: startListening,
    stop: stopListening,
    submitText,
    cancelReply,
    clearThread,
    status,
    audioRef,
  } = useVoiceSession({
    companion,
    tools,
    getDeviceState,
    onToolRun: (name, result) => append(`tool: ${name} → ${result}`, "hit"),
    onLog: (text, kind) => append(text, kind),
  });

  // Manual stroke state only — its `keywords` are intentionally NOT wired to
  // voice (Companions registers no vosk words).
  const stroke = useStrokeControls(vacuglide, player);

  const isCurrent = player.source === engine;
  const state = isCurrent ? player.state : "armed";

  // Arm the engine when the play view is up and the Player is free — mirrors
  // Autopilot. Entering play via Begin also arms directly; arm() is idempotent,
  // so at most one harmless re-arm happens before the player-view mirror catches
  // up. The setup view itself renders no device side effects.
  useEffect(() => {
    if (
      active &&
      view === "play" &&
      player.state === "armed" &&
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

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  const prevPhase = useRef(status.phase);
  useEffect(() => {
    if (status.phase !== prevPhase.current) {
      prevPhase.current = status.phase;
      append(`STT ${status.phase}`, "info");
    }
  }, [status.phase, append]);

  const prevCommitted = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommitted.current) {
      prevCommitted.current = status.committed;
      if (status.committed !== "")
        append(`heard: "${status.committed}"`, "hit");
    }
  }, [status.committed, append]);

  const prevReply = useRef(status.replyPlaying);
  useEffect(() => {
    if (status.replyPlaying !== prevReply.current) {
      prevReply.current = status.replyPlaying;
      append(status.replyPlaying ? "reply started" : "reply ended");
    }
  }, [status.replyPlaying, append]);

  const [text, setText] = useState("");
  // A final (committed) transcript is added to the chat by the voice session,
  // so clear the composer rather than dropping the transcript back into it.
  const prevCommittedForBox = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommittedForBox.current) {
      prevCommittedForBox.current = status.committed;
      if (status.committed !== "") setText("");
    }
  }, [status.committed]);

  // True while the user is dictating: the VAD hears voice, or interim (partial)
  // STT results are present. The composer shows the live partial and is locked.
  const dictating = status.vadSpeaking || status.partial !== "";

  // Play-view sub-tabs. Session (mic + conversation) opens first.
  const [tab, setTab] = useState<"session" | "controls" | "debug">("session");
  // The pinned program preview (Sparkline + Reset) is collapsed by default.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Keep the chat transcript scrolled to the newest message/streamed reply.
  const messagesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [
    status.thread,
    status.replyText,
    status.replyPlaying,
    status.awaitingSpeech,
  ]);

  // Focus the composer when the chat becomes visible (on load / entering Play).
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (active && view === "play" && tab === "session") {
      composerRef.current?.focus();
    }
  }, [active, view, tab]);

  const connected = vacuglide.connected;

  return (
    <section className="flex w-full flex-col gap-8">
      {/* TTS element — rendered once, in both views, so audioRef stays stable. */}
      <audio ref={audioRef} className="hidden" />

      {view === "setup" ? (
        <Card title="Companions">
          <p className="text-muted-foreground text-sm">
            Choose a companion. She listens, replies in her own voice, and runs
            the device while you talk — cut in any time and she stops.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {companionList.map((c) => {
              // Identical to the home algorithm list's card, minus the icon (and
              // no badge — Companions registers no vosk words). The accent
              // gradient is the companion's own accent_colour, interpolated in
              // and safelisted in globals.css.
              const accent = c.accent_colour;
              return (
                <Button
                  key={c.id}
                  onClick={() => {
                    setCompanionId(c.id);
                    enterPlay();
                  }}
                  className={`flex items-center gap-4 rounded-xl border border-${accent}-500 bg-linear-to-br from-${accent}-500/15 to-${accent}-500/5 px-4 py-3 text-left hover:from-${accent}-500/25 hover:to-${accent}-500/10`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="text-muted-foreground block text-sm">
                      {c.description}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </Button>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            <span className="text-foreground font-medium">Privacy.</span> Unlike
            the rest of Autogoon, Companions sends data off your device: your
            speech is transcribed by{" "}
            <span className="font-medium">ElevenLabs</span>, and replies are
            generated by an LLM through{" "}
            <span className="font-medium">OpenRouter</span> (routed to the
            fastest available provider). The conversation is stored in this
            browser.
          </p>
        </Card>
      ) : (
        // Viewport-height column: the preview+tabs cluster is fixed height and
        // the active tab's content flexes — so expanding the preview shrinks the
        // conversation rather than pushing the composer off the bottom.
        <div className="flex h-[calc(100dvh-9rem)] min-h-0 flex-col gap-3">
          {/* Collapsible program preview, grouped tightly with the tabs. */}
          <div className="flex shrink-0 flex-col gap-3">
            <Card>
              <Button
                flash={false}
                onClick={() => setPreviewOpen((o) => !o)}
                aria-expanded={previewOpen}
                className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-sm font-medium"
              >
                {previewOpen ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                Program preview
              </Button>
              {previewOpen && (
                <div className="mt-3">
                  <div className="mb-2 flex justify-end">
                    <Button
                      onClick={reset}
                      className="bg-secondary rounded-md px-3 py-1 text-xs font-medium"
                    >
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
                </div>
              )}
            </Card>

            {/* Sub-tabs — the top-level nav's underline style. No badges:
              Companions registers no vosk words. */}
            <nav className="flex gap-6 border-b">
              {(
                [
                  { id: "session", label: "Session" },
                  { id: "controls", label: "Controls" },
                  { id: "debug", label: "Debug" },
                ] as const
              ).map((t) => (
                <Button
                  key={t.id}
                  flash={false}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 py-3 text-sm font-medium ${
                    tab === t.id
                      ? "border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent"
                  }`}
                >
                  {t.label}
                </Button>
              ))}
            </nav>
          </div>

          {tab === "controls" && (
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
                    { value: "off", label: "Off" },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  value={variety}
                  onChange={changeVariety}
                  activeClass="bg-purple-600 text-white"
                />
              </Card>
            </div>
          )}

          {tab === "session" && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <Card className="shrink-0">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Row label="State">
                      <span
                        className={
                          status.vadSpeaking ? "text-emerald-500" : undefined
                        }
                      >
                        {status.vadSpeaking ? "speaking" : "quiet"}
                      </span>
                    </Row>
                    <RmsMeter rms={status.rms} speaking={status.vadSpeaking} />
                  </div>
                  <Button
                    onClick={() =>
                      status.micOn ? stopListening() : startListening()
                    }
                    aria-label={
                      status.micOn ? "Stop listening" : "Start listening"
                    }
                    title={status.micOn ? "Stop listening" : "Start listening"}
                    className={`flex shrink-0 items-center justify-center rounded-lg p-3 ${
                      status.micOn
                        ? "bg-foreground/10 hover:bg-foreground/20"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {status.micOn ? (
                      <MicOff className="size-5" />
                    ) : (
                      <Mic className="size-5" />
                    )}
                  </Button>
                </div>
              </Card>

              <Card
                title="Conversation"
                className="flex min-h-0 flex-1 flex-col"
              >
                {/* Scrolling transcript — fills the space; newest at the bottom
                    (auto-scrolled via messagesRef). */}
                <div
                  ref={messagesRef}
                  className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
                >
                  {status.thread.map((turn, i) =>
                    turn.role === "tool" ? (
                      <ToolChip key={i} name={turn.name} result={turn.result} />
                    ) : (
                      <ChatBubble
                        key={i}
                        role={turn.role}
                        text={turn.content}
                      />
                    ),
                  )}
                  {/* In-progress reply: a live, dimmed Elise bubble shown only until
                  the assistant turn commits — once the thread's last turn is the
                  assistant turn (the tail check below), the committed bubble
                  replaces it, even while a spoken reply is still playing. */}
                  {status.replyPlaying &&
                    status.replyText !== "" &&
                    [...status.thread].reverse().find((t) => t.role !== "tool")
                      ?.role !== "assistant" && (
                      <ChatBubble
                        role="assistant"
                        text={status.replyText}
                        pending
                      />
                    )}
                  {/* Pre-first-token gap: the existing Thinking… spinner. */}
                  {status.replyPlaying &&
                    status.replyText === "" &&
                    status.replyError === null && (
                      <div className="flex justify-start">
                        <p className="text-muted-foreground flex min-h-6 items-center gap-2 rounded-2xl px-3 py-2 text-sm">
                          <Spinner />
                          Thinking…
                        </p>
                      </div>
                    )}
                  {status.thread.length === 0 && !status.replyPlaying && (
                    <p className="text-muted-foreground text-sm">
                      No messages yet.
                    </p>
                  )}
                  {status.awaitingSpeech && (
                    <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                      <Spinner />
                      Waiting for speech…
                    </p>
                  )}
                </div>

                {/* Composer — pinned at the bottom. */}
                <div className="shrink-0 space-y-2 border-t pt-2">
                  {status.replyError !== null && (
                    <p className="text-sm text-red-500">
                      Error: {status.replyError}
                    </p>
                  )}
                  <textarea
                    ref={composerRef}
                    value={dictating ? status.partial : text}
                    disabled={dictating}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter says it (speaks the reply); Shift+Enter inserts a newline.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (text.trim() !== "" && !status.replyPlaying) {
                          submitText(text, { speak: true });
                          setText("");
                        }
                      }
                    }}
                    placeholder={
                      dictating ? "Listening…" : "Type a message, or speak…"
                    }
                    className="bg-foreground/5 min-h-16 w-full rounded-lg p-2 text-sm disabled:opacity-70"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        submitText(text, { speak: false });
                        setText("");
                      }}
                      disabled={text.trim() === "" || status.replyPlaying}
                      className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      Send
                    </Button>
                    <Button
                      onClick={() => {
                        submitText(text, { speak: true });
                        setText("");
                      }}
                      disabled={text.trim() === "" || status.replyPlaying}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Say it
                    </Button>
                    <Button
                      onClick={cancelReply}
                      disabled={!status.replyPlaying}
                      className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      Stop
                    </Button>
                    <Button
                      onClick={clearThread}
                      disabled={
                        status.replyPlaying || status.thread.length === 0
                      }
                      className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      Clear
                    </Button>
                    <span className="text-muted-foreground self-center text-sm">
                      {status.replyPlaying ? "working…" : "idle"}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {tab === "debug" && (
            <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto">
              <Card title="STT debug" bordered>
                <div className="text-muted-foreground flex gap-4 text-xs">
                  <span>STT {status.phase}</span>
                  <span>pre-roll {status.preRollFrames}</span>
                </div>
                <div className="mt-2 text-sm">
                  <p className="min-h-6">
                    <span className="text-muted-foreground text-xs">
                      finished{" "}
                    </span>
                    {status.committed !== "" ? (
                      status.committed
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                  <p className="min-h-6">
                    <span className="text-muted-foreground text-xs">
                      partial{" "}
                    </span>
                    {status.partial !== "" ? (
                      <span className="text-muted-foreground">
                        {status.partial}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                </div>
              </Card>

              <Card title="Latency" bordered>
                <p className="text-muted-foreground mb-1 text-xs">LLM</p>
                {status.metrics.llm === null ? (
                  <p className="text-muted-foreground text-sm">—</p>
                ) : (
                  <>
                    <Row label="First token">
                      {Math.round(status.metrics.llm.ttftMs)} ms
                    </Row>
                    <Row label="Throughput">
                      {status.metrics.llm.tps === null
                        ? "—"
                        : `${status.metrics.llm.tps.toFixed(1)} tok/s`}
                    </Row>
                    <Row label="Total">
                      {Math.round(status.metrics.llm.totalMs)} ms
                    </Row>
                  </>
                )}
                <p className="text-muted-foreground mt-3 mb-1 text-xs">TTS</p>
                {status.metrics.tts === null ? (
                  <p className="text-muted-foreground text-sm">—</p>
                ) : (
                  <>
                    <Row label="First audio">
                      {status.metrics.tts.ttfbMs === null
                        ? "—"
                        : `${Math.round(status.metrics.tts.ttfbMs)} ms`}
                    </Row>
                    <Row label="Total">
                      {Math.round(status.metrics.tts.totalMs)} ms
                    </Row>
                  </>
                )}
              </Card>

              <EventLog entries={log} />

              <LogCard
                title="Command log"
                header={<RateLimitMeter {...vacuglide.rateLimit} />}
                entries={vacuglide.logEntries}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
