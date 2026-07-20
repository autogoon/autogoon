"use client";

// Companions panel. Two jobs in one panel: (1) the voice session — the mic/STT/
// LLM/TTS loop via useVoiceSession, hosting the <audio> the TTS plays through;
// (2) a device-arming panel — it owns a CompanionEngine and arms/plays the one
// shared Player, so the device runs Elise's program while she talks. Slice 4a:
// one companion, a random program on fixed default knobs, temporary on-screen
// knobs (they become LLM-driven tools later), and buttons-only device controls
// (no vosk words — open dictation to Elise would otherwise transcribe them).
//
// Hot-path note: useVoiceSession returns one `status` object that churns ~50x/s
// while the mic is on; keep the render cheap. The event log is split into a
// memoized child so the rms churn doesn't reconcile it, and the fast loudness
// bar is isolated in <RmsMeter>.

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { LogCard, type LogEntry } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { Segmented } from "@/components/segmented";
import { SessionControls } from "@/components/session-controls";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { ELISE } from "@/lib/companions/companions";
import {
  CompanionEngine,
  type IntensityLevel,
  type EdgeControlLevel,
  type SuctionControlLevel,
} from "@/lib/algorithms/companion-engine";

// Fixed default knobs for 4a — the program is random within this baseline
// (generationBias -> knobs is deferred to when companion #2 lands).
const DEFAULT_INTENSITY: IntensityLevel = "medium";
const DEFAULT_EDGE: EdgeControlLevel = "moderate";
const DEFAULT_SUCTION: SuctionControlLevel = "little";

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
  const {
    start: startListening,
    stop: stopListening,
    submitText,
    cancelReply,
    status,
    audioRef,
  } = useVoiceSession();

  // The device engine — one instance, owned here.
  const engineRef = useRef<CompanionEngine | null>(null);
  engineRef.current ??= new CompanionEngine(
    DEFAULT_INTENSITY,
    DEFAULT_EDGE,
    DEFAULT_SUCTION,
  );
  const engine = engineRef.current;

  const [intensity, setIntensity] = useState<IntensityLevel>(DEFAULT_INTENSITY);
  const [edge, setEdge] = useState<EdgeControlLevel>(DEFAULT_EDGE);
  const [suction, setSuction] = useState<SuctionControlLevel>(DEFAULT_SUCTION);
  // Manual stroke state only — its `keywords` are intentionally NOT wired to
  // voice (Companions registers no vosk words this slice).
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

  // Device transport (the program) — distinct from the mic's start/stop.
  const startProgram = useCallback(() => {
    if (device.source !== engine) device.arm(engine);
    device.play();
  }, [device, engine]);
  const stopProgram = useCallback(() => {
    void device.pause();
  }, [device]);
  const reset = useCallback(() => {
    setIntensity(DEFAULT_INTENSITY);
    engine.setIntensity(DEFAULT_INTENSITY);
    setEdge(DEFAULT_EDGE);
    engine.setEdgeControl(DEFAULT_EDGE);
    setSuction(DEFAULT_SUCTION);
    engine.setSuctionControl(DEFAULT_SUCTION);
    device.arm(engine);
  }, [device, engine]);

  const enterPlay = useCallback(() => {
    device.arm(engine);
    onEnterPlay();
  }, [device, engine, onEnterPlay]);

  const changeIntensity = useCallback(
    (level: IntensityLevel) => {
      setIntensity(level);
      engine.setIntensity(level);
      device.invalidateFuture();
      vacuglide.log(`intensity → ${level}`);
    },
    [device, engine, vacuglide],
  );
  const changeEdge = useCallback(
    (level: EdgeControlLevel) => {
      setEdge(level);
      engine.setEdgeControl(level);
      device.invalidateFuture();
      vacuglide.log(`edge control → ${level}`);
    },
    [device, engine, vacuglide],
  );
  const changeSuction = useCallback(
    (level: SuctionControlLevel) => {
      setSuction(level);
      engine.setSuctionControl(level);
      device.invalidateValves();
      vacuglide.log(`vacuum maintenance → ${level}`);
    },
    [device, engine, vacuglide],
  );

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  // Transition log for the acceptance run.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  // Newest last (LogCard auto-scrolls to the bottom); `kind` picks the colour.
  const append = useCallback((text: string, kind = "send") => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    setLog((l) =>
      [...l, { id: logIdRef.current++, time, text, kind }].slice(-50),
    );
  }, []);

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
      if (status.committed !== "") append(`heard: "${status.committed}"`, "hit");
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
  const prevCommittedForBox = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommittedForBox.current) {
      prevCommittedForBox.current = status.committed;
      if (status.committed !== "") setText(status.committed);
    }
  }, [status.committed]);

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
          <div className="mt-2 rounded-lg border border-emerald-500 bg-linear-to-br from-emerald-500/15 to-emerald-500/5 p-4">
            <p className="font-medium">{ELISE.name}</p>
            <p className="text-muted-foreground text-sm">
              A high-energy, flirty streamer with a dry, quieter side.
            </p>
          </div>
          {/* No badge — Companions registers no vosk words this slice. */}
          <Button
            onClick={enterPlay}
            className="mt-4 w-full rounded-lg bg-blue-600 py-3.5 text-lg font-bold text-white"
          >
            Begin
          </Button>
        </Card>
      ) : (
        <>
          <SessionControls
            state={state}
            connected={connected}
            onStart={startProgram}
            onStop={stopProgram}
            onReset={reset}
          />

          <Card>
            <Sparkline
              points={player.upcoming.speed}
              valves={player.upcoming.valves}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>now</span>
              <span>+60s</span>
            </div>
          </Card>

          <StrokeCard
            strokeDisabled={!stroke.canStroke}
            strokePulsing={stroke.strokePulsing}
            onValvePlus={vacuglide.valvePlus}
            onValveMinus={vacuglide.valveMinus}
            onError={logError}
            voice={false}
          />

          {/* Temporary bring-up knobs — Elise will turn these herself via LLM
              tools in a later slice, at which point they come off the screen. */}
          <Card title="Intensity">
            <Segmented
              options={[
                { value: "warmup", label: "Warmup" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
              value={intensity}
              onChange={changeIntensity}
              activeClass="bg-blue-600 text-white"
            />
          </Card>

          <Card title="Edge Control">
            <Segmented
              options={[
                { value: "gentle", label: "Gentle" },
                { value: "moderate", label: "Moderate" },
                { value: "intense", label: "Intense" },
              ]}
              value={edge}
              onChange={changeEdge}
              activeClass="bg-orange-500 text-white"
            />
          </Card>

          <Card title="Vacuum Maintenance">
            <Segmented
              options={[
                { value: "off", label: "Off" },
                { value: "little", label: "Light" },
                { value: "more", label: "Heavy" },
              ]}
              value={suction}
              onChange={changeSuction}
              activeClass="bg-cyan-600 text-white"
            />
          </Card>

          <Card title="Microphone">
            <Button
              onClick={() =>
                status.micOn ? stopListening() : startListening()
              }
              className={`w-full rounded-lg px-4 py-3 text-sm font-medium ${
                status.micOn
                  ? "bg-foreground/10 hover:bg-foreground/20"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {status.micOn ? "Stop listening" : "Start listening"}
            </Button>
            <div className="mt-2">
              <Row label="Mic">{status.micOn ? "on" : "off"}</Row>
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
          </Card>

          <Card title="Conversation">
            <p className="text-muted-foreground text-sm">
              Speak (hands-free) or type. <strong>Send</strong> runs the model
              only; <strong>Say it</strong> speaks the reply. Stop — or just
              talk over her — to cut it.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message, or speak…"
              className="bg-foreground/5 mt-2 min-h-16 w-full rounded-lg p-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <Button
                onClick={() => submitText(text, { speak: false })}
                disabled={text.trim() === "" || status.replyPlaying}
                className="bg-foreground/10 hover:bg-foreground/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Send
              </Button>
              <Button
                onClick={() => submitText(text, { speak: true })}
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
              <span className="text-muted-foreground self-center text-sm">
                {status.replyPlaying ? "working…" : "idle"}
              </span>
            </div>
            {status.replyError !== null && (
              <p className="mt-2 text-sm text-red-500">
                Error: {status.replyError}
              </p>
            )}
            <div className="mt-2 text-sm">
              <p className="text-muted-foreground mb-1">Response</p>
              {status.replyPlaying &&
              status.replyText === "" &&
              status.replyError === null ? (
                // Request sent, no tokens back yet — awaiting the LLM.
                <p className="text-muted-foreground flex min-h-6 items-center gap-2">
                  <Spinner />
                  Thinking…
                </p>
              ) : (
                <p className="min-h-6 whitespace-pre-wrap">
                  {status.replyText === "" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    status.replyText
                  )}
                </p>
              )}
              {status.awaitingSpeech && (
                <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                  <Spinner />
                  Waiting for speech…
                </p>
              )}
            </div>
          </Card>

          <Card title="STT debug" bordered>
            <div className="text-muted-foreground flex gap-4 text-xs">
              <span>STT {status.phase}</span>
              <span>pre-roll {status.preRollFrames}</span>
            </div>
            <div className="mt-2 text-sm">
              <p className="min-h-6">
                <span className="text-muted-foreground text-xs">finished </span>
                {status.committed !== "" ? (
                  status.committed
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
              <p className="min-h-6">
                <span className="text-muted-foreground text-xs">partial </span>
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
        </>
      )}
    </section>
  );
}
