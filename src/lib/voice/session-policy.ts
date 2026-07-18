// Pure decisions for the STT socket lifecycle and barge-in, kept out of the
// effectful socket/audio code so they can be unit-tested.
export type SttPhase = "closed" | "connecting" | "open" | "closing";

export function shouldOpenSocket(phase: SttPhase, onset: boolean): boolean {
  return onset && phase === "closed";
}

export function shouldCloseSocket(
  phase: SttPhase,
  lastVoiceAtMs: number,
  nowMs: number,
  timeoutMs: number,
): boolean {
  return phase === "open" && nowMs - lastVoiceAtMs >= timeoutMs;
}

export function isBargeIn(replyPlaying: boolean, onset: boolean): boolean {
  return replyPlaying && onset;
}
