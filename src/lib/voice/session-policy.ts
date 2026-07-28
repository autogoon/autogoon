// Pure decisions for the STT socket lifecycle and barge-in, kept out of the
// effectful socket/audio code so they can be unit-tested.
export type SttPhase = 'closed' | 'connecting' | 'open' | 'closing';

export function shouldOpenSocket(phase: SttPhase, onset: boolean): boolean {
  return onset && phase === 'closed';
}

// A barge-in cuts the companion off only once we've actually decoded speech —
// `speechConfirmed` — not on raw mic energy. See partialHasWord: waiting for a
// real word means a cough, a thump, or the companion's own audio leaking past
// AEC no longer interrupts them; the cut lands a beat later, when you're
// clearly talking.
export function isBargeIn(
  replyPlaying: boolean,
  speechConfirmed: boolean,
): boolean {
  return replyPlaying && speechConfirmed;
}

// True once an STT partial contains a real word (at least one alphanumeric run),
// the signal we gate barge-in on instead of VAD onset.
function partialHasWord(partial: string): boolean {
  return /[\p{L}\p{N}]/u.test(partial);
}

// Words in a partial — whitespace-separated runs holding a letter or digit, so
// stray punctuation ("...", ",") counts for nothing.
export function partialWordCount(partial: string): number {
  return partial.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

// Whether the current utterance has confirmed real speech, and so whether its
// partials can drive the composer and barge-in. Sticky (`alreadyConfirmed`
// carries forward), and callers reset it at each utterance boundary.
//
// What it guards against is the phantom: a token the STT hallucinates from
// near-silence ("Yes.", "No.") when a cough or a thump opens the socket, which
// would otherwise take over the composer or cut the companion off mid-reply.
//
// `voicedMs` is the longest run of voicing in this utterance, NOT whether the
// mic is live at this instant. A partial describes audio from up to a second
// ago, so a short utterance is finished — and the VAD long since released —
// before its own transcript returns. Judging it on the VAD's present state
// rejects real speech for being brief, and blocks barge-in on exactly the
// short interjections ("stop", "wait") most likely to be used to interrupt.
export function confirmSpeech(
  alreadyConfirmed: boolean,
  partial: string,
  voicedMs: number,
  min: { voicedMs: number; words: number },
): boolean {
  if (alreadyConfirmed) return true;
  if (!partialHasWord(partial)) return false;
  // Either signal suffices, because each covers where the other fails. Voicing
  // misses quiet speech: the VAD tracks loudness, and a softly-spoken sentence
  // dips under the offset threshold repeatedly, so a real sentence can be
  // credited a fraction of its true length. Word count misses a deliberate
  // one-word utterance ("stop"). What neither mistakes is the phantom itself —
  // a single token hallucinated from a cough — which is short in both.
  return voicedMs >= min.voicedMs || partialWordCount(partial) >= min.words;
}

// What the voice session is doing right now, as one stage for status displays
// (the lightbox badge). Precedence: the user's own speech streaming in wins
// over everything (a confirmed partial is about to barge in anyway), then the
// reply pipeline in reverse order — audio playing, TTS requested, tokens
// arriving, request sent. On a tool-call turn the stages replay naturally
// (speaking → thinking → streaming → tts → speaking) because the hook clears
// replyText before the reaction call.
export type VoiceStage =
  'idle' | 'listening' | 'thinking' | 'streaming' | 'tts' | 'speaking';

export function voiceStage(s: {
  partial: string;
  replyPlaying: boolean;
  replyText: string;
  awaitingSpeech: boolean;
  speaking: boolean;
}): VoiceStage {
  if (s.partial !== '') return 'listening';
  if (s.speaking) return 'speaking';
  if (s.awaitingSpeech) return 'tts';
  if (s.replyPlaying) return s.replyText !== '' ? 'streaming' : 'thinking';
  return 'idle';
}
