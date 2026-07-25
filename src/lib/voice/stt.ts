// Realtime STT WebSocket lifecycle client for Companions: mint a single-use
// token, open the ElevenLabs realtime socket, flush the pre-roll once the
// session starts, stream audio frames while an utterance is in flight, and
// surface partial/committed transcripts. With commit_strategy=vad the server
// VAD emits committed transcripts, so we never send commits ourselves — and
// nothing here closes an idle socket, which is ElevenLabs' to end (see
// ARCHITECTURE.md, Companions' voice subsystem). Integration code — no unit
// test (the pure lifecycle decisions live in session-policy.ts and are tested
// there).
import { pcm16ToBase64 } from './audio-encoding';
import { type SttPhase, shouldOpenSocket } from './session-policy';
import { ACCESS_HEADER, getAccessId } from '@/lib/companions/access';

export type SttEvents = {
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onPhase: (phase: SttPhase) => void;
  // An error message from the server, verbatim. Nothing acts on these — they
  // exist so a socket that drops or throttles says why in the event log
  // instead of just going quiet.
  onServerError: (raw: string) => void;
  // How the socket ended. `local` separates our own close() from one the far
  // end started, which is the difference between a session we ended and one
  // that was taken from us; the close frame's code and reason are the only
  // account we get of the latter.
  onClosed: (info: {
    local: boolean;
    code: number;
    reason: string;
    wasClean: boolean;
  }) => void;
};

type IncomingMessage = { message_type?: string; text?: string };

// Cap the connecting-window buffer so a socket that never starts can't grow it
// without bound. ~10s at 20 ms/frame — far more than a normal open (1–2s).
const MAX_PENDING_FRAMES = 500;

export type Stt = {
  beginUtterance: (getPreRoll: () => Int16Array[]) => void;
  sendFrame: (base64Pcm: string) => void;
  // Ends the session's socket. Idle sockets need no help: ElevenLabs close
  // them from their end with a clean 1000, so the only close we make is this
  // deliberate one, when the voice session itself stops.
  close: () => void;
  phase: () => SttPhase;
  framesSent: () => number;
};

export function createStt(events: SttEvents): Stt {
  let ws: WebSocket | null = null;
  let phase: SttPhase = 'closed';
  // Audio only flows while an utterance is in flight, so an open socket between
  // turns costs nothing (ElevenLabs bills audio processed, not connection
  // uptime). The gate opens at the VAD's onset and closes on the server's
  // committed transcript — deliberately NOT on the VAD's offset, because
  // commit_strategy=vad means the server has to hear the trailing silence to
  // decide the utterance ended. Cut the audio at our own offset and the commit
  // never arrives, so the turn never runs.
  let streaming = false;
  // Frames actually put on the wire, so a session can report how much audio it
  // streamed and that can be checked against the bill.
  let sent = 0;
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
        message_type: 'input_audio_chunk',
        audio_base_64: base64Pcm,
        commit: false,
      }),
    );
    sent += 1;
  }

  function sendFrame(base64Pcm: string): void {
    // Between utterances the socket stays up but silent — this is the whole
    // saving, so the gate is checked before anything else.
    if (!streaming) return;
    if (phase === 'open' && ws?.readyState === WebSocket.OPEN) {
      rawSend(base64Pcm);
    } else if (phase === 'connecting' && pending.length < MAX_PENDING_FRAMES) {
      // Buffer while the socket comes up; flushed on session_started.
      pending.push(base64Pcm);
    }
    // closed/closing: no active listening turn — drop.
  }

  // A VAD onset: start streaming this utterance. Opens the socket if it's cold,
  // and on a warm one flushes the pre-roll straight down it so the opening word
  // survives — the socket is held open between turns, so most utterances begin
  // mid-connection rather than at connect. getPreRoll is a callback because
  // flushing drains the mic's ring: it must only be called when this really is
  // a fresh utterance, never on an onset that lands while an earlier one is
  // still streaming.
  function beginUtterance(getPreRoll: () => Int16Array[]): void {
    if (streaming) return;
    streaming = true;
    if (shouldOpenSocket(phase, true)) {
      void open(getPreRoll()).catch(() => {});
      return;
    }
    // Connecting: frames are already buffering into `pending`, and the pre-roll
    // went with the open() that started it — nothing to add.
    if (phase !== 'open') return;
    for (const frame of getPreRoll()) rawSend(pcm16ToBase64(frame));
  }

  async function open(preRoll: Int16Array[]): Promise<void> {
    // Guard double-open: only start from a fully closed socket.
    if (phase !== 'closed') return;
    setPhase('connecting');
    pending = [];

    let token: string;
    try {
      const res = await fetch('/api/stt-token', {
        method: 'POST',
        headers: { [ACCESS_HEADER]: getAccessId() },
      });
      if (!res.ok) throw new Error(`stt-token ${res.status}`);
      ({ token } = (await res.json()) as { token: string });
    } catch (err) {
      // Token fetch failed: roll straight back to closed.
      setPhase('closed');
      throw err;
    }

    const url =
      `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${encodeURIComponent(token)}` +
      // Pin the language to English — without it Scribe auto-detects per
      // utterance and often drifts to Russian/Polish on short English speech.
      `&audio_format=pcm_16000&commit_strategy=vad&language_code=en`;
    const socket = new WebSocket(url);
    ws = socket;

    socket.addEventListener('message', (event) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(event.data as string) as IncomingMessage;
      } catch {
        return;
      }
      switch (msg.message_type) {
        case 'session_started': {
          setPhase('open');
          // Opening audio in capture order: the pre-roll ring (just before
          // onset), then everything captured while the socket was connecting.
          for (const frame of preRoll) rawSend(pcm16ToBase64(frame));
          for (const frame of pending) rawSend(frame);
          pending = [];
          break;
        }
        case 'partial_transcript': {
          if (typeof msg.text === 'string') events.onPartial(msg.text);
          break;
        }
        case 'committed_transcript': {
          // The server has decided the utterance ended, so it needs no more
          // audio until the next onset — stop streaming, keep the socket.
          streaming = false;
          if (typeof msg.text === 'string') events.onCommitted(msg.text);
          break;
        }
        default: {
          // Every error the server can raise — insufficient audio activity,
          // quota, throttling, rate limits, session time limit — arrives as its
          // own message_type, and several of them precede a close. Match on the
          // name rather than listing them, so a type added upstream still shows
          // up. The payload goes through raw: we don't model these, and a
          // truncated one is worse than useless when a session drops.
          if (msg.message_type?.includes('error') === true) {
            events.onServerError(event.data as string);
          }
          break;
        }
      }
    });

    socket.addEventListener('close', (event) => {
      // Read before setPhase: close() moves us to "closing" first, so that
      // phase is what distinguishes our own hang-up from the server's.
      const local = phase === 'closing';
      if (ws === socket) ws = null;
      pending = [];
      // No socket, no utterance — the next onset opens both.
      streaming = false;
      setPhase('closed');
      events.onClosed({
        local,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    });

    socket.addEventListener('error', () => {
      // Errors are followed by a close event, which drives the phase back to
      // closed; nothing extra to do here.
    });
  }

  function close(): void {
    if (phase === 'closed' || phase === 'closing') return;
    if (ws === null) {
      // No socket yet (token still in flight): nothing to wait on.
      setPhase('closed');
      return;
    }
    setPhase('closing');
    ws.close();
    // The socket's close handler will settle the phase at "closed".
  }

  return {
    beginUtterance,
    sendFrame,
    close,
    phase: () => phase,
    framesSent: () => sent,
  };
}
