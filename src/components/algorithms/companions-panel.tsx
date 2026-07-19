"use client";

// Companions panel: one testing surface over useVoiceSession. It does NOT own an
// engine or arm the Player — there's no device this slice. It drives the mic
// session (start/stop), hosts the <audio> element the TTS player plays through,
// and folds transcription, the LLM, and the reply into a single Conversation
// card: speak (hands-free) or type, then Send (LLM only) or Say it (LLM → speak).
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
  const { start, stop, submitText, cancelReply, status, audioRef } =
    useVoiceSession();

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

  // The Conversation box: typed text, or a committed voice transcript dropped in
  // so you can see what she heard (the hands-free turn has already fired from the
  // hook). Local state so typing doesn't churn the session.
  const [text, setText] = useState("");
  const prevCommittedForBox = useRef(status.committed);
  useEffect(() => {
    if (status.committed !== prevCommittedForBox.current) {
      prevCommittedForBox.current = status.committed;
      if (status.committed !== "") setText(status.committed);
    }
  }, [status.committed]);

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

      <Card title="Conversation">
        <p className="text-muted-foreground text-sm">
          Speak (hands-free) or type. <strong>Send</strong> runs the model only;{" "}
          <strong>Say it</strong> speaks the reply. Stop — or just talk over her
          — to cut it.
        </p>

        {/* Live transcription: STT diagnostics + the rolling transcript. */}
        <div className="text-muted-foreground mt-2 flex gap-4 text-xs">
          <span>STT {status.phase}</span>
          <span>pre-roll {status.preRollFrames}</span>
        </div>
        <p className="min-h-6 text-sm">
          {status.committed !== "" && <span>{status.committed} </span>}
          {status.partial !== "" && (
            <span className="text-muted-foreground">{status.partial}</span>
          )}
          {status.committed === "" && status.partial === "" && (
            <span className="text-muted-foreground">Nothing heard yet.</span>
          )}
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
          <p className="min-h-6 whitespace-pre-wrap">
            {status.replyText === "" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              status.replyText
            )}
          </p>
        </div>
      </Card>

      <Card title="Events">
        <EventLog entries={log} />
      </Card>
    </section>
  );
}
