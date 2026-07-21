// Realtime STT WebSocket lifecycle client for Companions: mint a single-use
// token, open the ElevenLabs realtime socket, flush the pre-roll once the
// session starts, stream audio frames, and surface partial/committed
// transcripts. With commit_strategy=vad the server VAD emits committed
// transcripts, so we never send commits ourselves. Integration code — no unit
// test (the pure lifecycle decisions live in session-policy.ts and are tested
// there); verified in the Task 13 acceptance run.
import { pcm16ToBase64 } from "./audio-encoding";
import { type SttPhase, shouldCloseSocket } from "./session-policy";

export type SttEvents = {
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onPhase: (phase: SttPhase) => void;
};

type IncomingMessage = { message_type?: string; text?: string };

// Cap the connecting-window buffer so a socket that never starts can't grow it
// without bound. ~10s at 20 ms/frame — far more than a normal open (1–2s).
const MAX_PENDING_FRAMES = 500;

export type Stt = {
  open: (preRoll: Int16Array[]) => Promise<void>;
  sendFrame: (base64Pcm: string) => void;
  noteVoice: (nowMs: number) => void;
  maybeClose: (nowMs: number, timeoutMs: number) => void;
  close: () => void;
  phase: () => SttPhase;
};

export function createStt(events: SttEvents): Stt {
  let ws: WebSocket | null = null;
  let phase: SttPhase = "closed";
  let lastVoiceAtMs = 0;
  // Frames captured after open() is called but before the socket is live
  // (session_started) — the token fetch + WebSocket handshake, often 1–2s.
  // Without this they'd be dropped, losing the opening seconds of speech; they
  // are flushed in capture order once the session starts.
  let pending: string[] = [];

  function setPhase(next: SttPhase): void {
    if (next === phase) return;
    phase = next;
    events.onPhase(phase);
  }

  function rawSend(base64Pcm: string): void {
    ws?.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: base64Pcm,
        commit: false,
      }),
    );
  }

  function sendFrame(base64Pcm: string): void {
    if (phase === "open" && ws?.readyState === WebSocket.OPEN) {
      rawSend(base64Pcm);
    } else if (phase === "connecting" && pending.length < MAX_PENDING_FRAMES) {
      // Buffer while the socket comes up; flushed on session_started.
      pending.push(base64Pcm);
    }
    // closed/closing: no active listening turn — drop.
  }

  async function open(preRoll: Int16Array[]): Promise<void> {
    // Guard double-open: only start from a fully closed socket.
    if (phase !== "closed") return;
    setPhase("connecting");
    pending = [];

    let token: string;
    try {
      const res = await fetch("/api/stt-token", { method: "POST" });
      if (!res.ok) throw new Error(`stt-token ${res.status}`);
      ({ token } = (await res.json()) as { token: string });
    } catch (err) {
      // Token fetch failed: roll straight back to closed.
      setPhase("closed");
      throw err;
    }

    const url =
      `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${encodeURIComponent(token)}` +
      // Pin the language to English — without it Scribe auto-detects per
      // utterance and often drifts to Russian/Polish on short English speech.
      `&audio_format=pcm_16000&commit_strategy=vad&language_code=en`;
    const socket = new WebSocket(url);
    ws = socket;

    socket.addEventListener("message", (event) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(event.data as string) as IncomingMessage;
      } catch {
        return;
      }
      switch (msg.message_type) {
        case "session_started": {
          setPhase("open");
          // Opening audio in capture order: the pre-roll ring (just before
          // onset), then everything captured while the socket was connecting.
          for (const frame of preRoll) rawSend(pcm16ToBase64(frame));
          for (const frame of pending) rawSend(frame);
          pending = [];
          break;
        }
        case "partial_transcript": {
          if (typeof msg.text === "string") events.onPartial(msg.text);
          break;
        }
        case "committed_transcript": {
          if (typeof msg.text === "string") events.onCommitted(msg.text);
          break;
        }
        default:
          break;
      }
    });

    socket.addEventListener("close", () => {
      if (ws === socket) ws = null;
      pending = [];
      setPhase("closed");
    });

    socket.addEventListener("error", () => {
      // Errors are followed by a close event, which drives the phase back to
      // closed; nothing extra to do here.
    });
  }

  function noteVoice(nowMs: number): void {
    lastVoiceAtMs = nowMs;
  }

  function close(): void {
    if (phase === "closed" || phase === "closing") return;
    if (ws === null) {
      // No socket yet (token still in flight): nothing to wait on.
      setPhase("closed");
      return;
    }
    setPhase("closing");
    ws.close();
    // The socket's close handler will settle the phase at "closed".
  }

  function maybeClose(nowMs: number, timeoutMs: number): void {
    if (shouldCloseSocket(phase, lastVoiceAtMs, nowMs, timeoutMs)) close();
  }

  return {
    open,
    sendFrame,
    noteVoice,
    maybeClose,
    close,
    phase: () => phase,
  };
}
