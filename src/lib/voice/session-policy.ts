// Pure decisions for the STT socket lifecycle and barge-in, kept out of the
// effectful socket/audio code so they can be unit-tested.
export type SttPhase = 'closed' | 'connecting' | 'open' | 'closing';

export function shouldOpenSocket(phase: SttPhase, onset: boolean): boolean {
  return onset && phase === 'closed';
}

export function shouldCloseSocket(
  phase: SttPhase,
  lastVoiceAtMs: number,
  nowMs: number,
  timeoutMs: number,
): boolean {
  return phase === 'open' && nowMs - lastVoiceAtMs >= timeoutMs;
}

// A barge-in cuts the companion off only once we've actually decoded speech —
// `speechConfirmed` — not on raw mic energy. See partialHasWord: waiting for a
// real word means a cough, a thump, or her own audio leaking past AEC no longer
// interrupts her; the cut lands a beat later, when you're clearly talking.
export function isBargeIn(
  replyPlaying: boolean,
  speechConfirmed: boolean,
): boolean {
  return replyPlaying && speechConfirmed;
}

// True once an STT partial contains a real word (at least one alphanumeric run),
// the signal we gate barge-in on instead of VAD onset.
export function partialHasWord(partial: string): boolean {
  return /[\p{L}\p{N}]/u.test(partial);
}
