"use client";

// Companions Slice 1 panel: a voice-lab surface over useVoiceSession. It does
// NOT own an engine or arm the Player — there's no device this slice. It just
// drives the mic session (start/stop), hosts the <audio> element the TTS player
// plays through, and shows a live diagnostic readout for the acceptance run.
//
// Hot-path note: useVoiceSession returns one `status` object that churns ~50×/s
// (rms/preRollFrames refresh every mic frame), so this component re-renders at
// that rate whenever the mic is on — unavoidable without changing the committed
// hook, which owns the single mic session and so must be called exactly once.
// The response is to keep the render cheap: a tiny static tree, no per-frame
// allocation or heavy work, the fast bar isolated in its own <RmsMeter>, and the
// event log (the one non-trivial subtree, a map) split into a memoized child so
// it isn't reconciled on the frames where only rms moved.

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
import { useVoiceSession } from "@/hooks/use-voice-session";

// The session's fast-moving loudness bar — the one thing that genuinely wants to
// repaint every frame. Kept small and on its own.
function RmsMeter({ rms, speaking }: { rms: number; speaking: boolean }) {
  // rms sits around 0.02 (quiet) to ~0.2 (loud speech); ×500 fills the bar
  // across that range.
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

type LogEntry = { id: number; text: string };

// The event log's map is the priciest part of the tree; memoized on its entries
// (which change only on a real transition) so the 50 Hz rms churn skips it.
const EventLog = memo(function EventLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No events yet.</p>;
  }
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
      {entries.map((e) => (
        <li key={e.id} className="text-muted-foreground">
          {e.text}
        </li>
      ))}
    </ul>
  );
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export function CompanionsPanel({ active }: { active: boolean }) {
  const { start, stop, status, audioRef } = useVoiceSession();

  // A hot mic must not linger once you leave the screen. The panels stay mounted
  // (hidden via CSS), so unmount won't fire — tear the session down when this one
  // goes inactive. stop() is idempotent, so an inactive mount is harmless.
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  // A small transition log for the acceptance run. Each source only changes on a
  // real event, so these effects don't fire on the per-frame rms churn.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const append = useCallback((text: string) => {
    setLog((l) => [{ id: logIdRef.current++, text }, ...l].slice(0, 30));
  }, []);

  const prevPhase = useRef(status.phase);
  useEffect(() => {
    if (status.phase !== prevPhase.current) {
      prevPhase.current = status.phase;
      append(`STT ${status.phase}`);
    }
  }, [status.phase, append]);

  const prevCommitted = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommitted.current) {
      prevCommitted.current = status.committed;
      if (status.committed !== "") append(`heard: "${status.committed}"`);
    }
  }, [status.committed, append]);

  const prevReply = useRef(status.replyPlaying);
  useEffect(() => {
    if (status.replyPlaying !== prevReply.current) {
      prevReply.current = status.replyPlaying;
      append(status.replyPlaying ? "reply started" : "reply ended");
    }
  }, [status.replyPlaying, append]);

  // Reply elapsed, read live off the same 50 Hz render (the mic keeps ticking
  // during a reply, for barge-in), so no extra timer is needed.
  const replyStartRef = useRef(0);
  useEffect(() => {
    if (status.replyPlaying) replyStartRef.current = Date.now();
  }, [status.replyPlaying]);
  const replyElapsed = status.replyPlaying
    ? (Date.now() - replyStartRef.current) / 1000
    : 0;

  return (
    <section className="flex w-full flex-col gap-8">
      <Card title="Companions">
        <p className="text-muted-foreground text-sm">
          Talk to Elise. Start listening, speak, and she replies in her own
          voice — cut in any time and she stops.
        </p>
        <Button
          onClick={() => (status.micOn ? stop() : start())}
          className={`mt-2 w-full rounded-lg px-4 py-3 text-sm font-medium ${
            status.micOn
              ? "bg-foreground/10 hover:bg-foreground/20"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {status.micOn ? "Stop listening" : "Start listening"}
        </Button>
        {/* The TTS player plays through this element; hidden, but it still plays. */}
        <audio ref={audioRef} className="hidden" />
      </Card>

      <Card title="Microphone">
        <Row label="Mic">{status.micOn ? "on" : "off"}</Row>
        <Row label="Echo cancellation">
          <span className={status.micOn ? "text-emerald-500" : undefined}>
            {status.micOn ? "on" : "—"}
          </span>
        </Row>
      </Card>

      <Card title="Voice activity">
        <Row label="State">
          <span className={status.vadSpeaking ? "text-emerald-500" : undefined}>
            {status.vadSpeaking ? "speaking" : "quiet"}
          </span>
        </Row>
        <RmsMeter rms={status.rms} speaking={status.vadSpeaking} />
        <Row label="RMS">{status.rms.toFixed(3)}</Row>
      </Card>

      <Card title="Transcription">
        <Row label="STT phase">{status.phase}</Row>
        <Row label="Pre-roll buffered">{status.preRollFrames} frames</Row>
        <div className="text-sm">
          <p className="text-muted-foreground mb-1">Transcript</p>
          <p className="min-h-6">
            {status.committed !== "" && <span>{status.committed} </span>}
            {status.partial !== "" && (
              <span className="text-muted-foreground">{status.partial}</span>
            )}
            {status.committed === "" && status.partial === "" && (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>
      </Card>

      <Card title="Reply">
        <Row label="State">
          <span
            className={status.replyPlaying ? "text-emerald-500" : undefined}
          >
            {status.replyPlaying ? "playing" : "idle"}
          </span>
        </Row>
        {status.replyPlaying && (
          <Row label="Elapsed">{replyElapsed.toFixed(1)}s</Row>
        )}
      </Card>

      <Card title="Events">
        <EventLog entries={log} />
      </Card>
    </section>
  );
}
