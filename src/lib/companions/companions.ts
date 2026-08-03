// The built-in companions. An imported goonpack adds further companions at
// runtime (src/lib/goonpacks/).
import type { MediaKind } from '@/lib/goonpacks/media';
import type { SidecarValue } from '@/lib/goonpacks/sidecar';
import { AIMEE_SYSTEM_PROMPT } from './aimee-prompt';
import { MILEY_SYSTEM_PROMPT } from './miley-prompt';

// One thing a companion can send: a still or a video — one entry per item of
// valid media, since that is all a pack's `media` holds (parsePack). Both texts
// therefore always carry something: they come from the pack's <basename>.md
// sidecar, and an item without one is not in the set at all. `caption` is the
// one line the model reads to pick a fitting one, `description` the long prose
// behind it. `ref` is the
// thread-stable reference — object URLs die with the session, so a sent item
// persists as `ref` and rendering resolves it against whatever's currently
// loaded. `src` is that object URL once it exists: `load()` mints it on first
// render (a pack's media is thousands of files, most of which are never shown)
// and memoises it here, and it stays alive as long as this entry does —
// `forget()` is what ends that, for the owner of the URL once it has revoked it.
export type CompanionMedia = {
  kind: MediaKind;
  caption: string;
  description: string;
  // Everything else the sidecar's frontmatter carried, whatever it was called.
  // The pack format does not own the question set (goonpacks/sidecar.ts), so
  // what is in here is whatever wrote the sidecar — empty for one carrying a
  // caption alone.
  values: Record<string, SidecarValue>;
  ref: string;
  src?: string;
  load(): Promise<string>;
  // Drop the memoised URL: the next `load()` reads the file again, or fails and
  // renders as missing if it has gone.
  forget(): void;
};

export type Companion = {
  // `publisher.name` (src/lib/goonpacks/manifest.ts); the built-ins use the
  // "autogoon" publisher. The picker selection, the play session and the saved
  // thread all key off it.
  id: string;
  name: string;
  description: string; // one-line blurb shown on the picker card
  // The situation the thread opens on, written to the person playing and shown
  // at the top of the transcript. Never sent to the model: the persona prompt's
  // own setup is what tells them where they are, and this is the same scene from
  // the other side.
  intro: string;
  gender: 'female' | 'male' | 'nonbinary';
  accentColour: string; // their signature colour name, e.g. "pink" or "emerald"
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  // The chosen model's context window, in tokens. Nothing reads it yet —
  // deliberately captured anyway, because it belongs to whoever picked `model`,
  // and a pack authored without it would have to be revisited to supply a number
  // its author knew all along.
  contextWindow: number;
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
  // How readily this companion fills a silence, 1–5, as two separate appetites:
  // the conversational one and the one for talking over a running program. They
  // are deliberately independent — a laconic persona can still narrate play
  // relentlessly — and each sets its own ambient cadence (see
  // ambientDelayMs).
  chattiness: number; // out of play: how much they keep a conversation going
  playfulness: number; // during play: how much they talk over the device
  // IANA zone, absent when this companion has no clock of their own. Absent
  // rather than defaulted, like `media` and `mediaSummary`: no zone is a fact
  // about the companion, not a value waiting to be filled in.
  //
  // `usesRealTime: true` with no zone is invalid — a companion claiming a clock
  // that nothing can render. parsePack refuses it in a complete pack's
  // manifest, the chooser card disables the overlay/base pairings that would
  // produce it, and applyOverlay throws on one that reaches it anyway. The type
  // still admits it: expressing it would need a union discriminated on
  // usesRealTime, and applyOverlay computes the two fields separately, so what
  // it assembles types as `{ usesRealTime: boolean; timezone: string |
  // undefined }` and matches neither arm.
  timezone?: string;
  usesRealTime: boolean; // false: the persona prompt supplies its own time of day
  knowsUserTime: boolean; // false: the user's clock (THEIR TIME) is not sent
  // The media they can send during a session — filled by an installed goonpack
  // (src/lib/goonpacks/), and valid media only, so every entry is one they can
  // actually be offered. Empty (or omitted) for a companion with no pack
  // installed, or one whose pack's sidecars aren't written yet: the panel then
  // offers neither media tool, and their prompt's media section is the one
  // saying they have nothing to send.
  media?: CompanionMedia[];
  // What that set holds, as one block of text — present whenever `media` is,
  // because a pack carrying media must carry a summary of it (parsePack).
  // Written by npm run goonpack:summarise; nothing here reads into it.
  mediaSummary?: string;
};

// The zone a companion's own clock is rendered in, or undefined when they have
// none — a zone they are off real time for is not a clock. Both sides of the
// pair that has to agree read it: the rules appended at load (resolve.ts) and
// the MY TIME line sent each turn (use-voice-session.ts).
export const companionClockZone = (companion: Companion): string | undefined =>
  companion.usesRealTime ? companion.timezone : undefined;

// App defaults a pack manifest may omit (spec: model/contextWindow/
// passesReasoning "default to the app's current defaults").
// `:nitro` sorts OpenRouter's providers by throughput instead of its default
// price-weighted load balancing — a companion's reply is spoken, so time to
// first token is the pause before they answer.
//
// Not the MiniMax family — `minimax/*` breaks two things this app relies on,
// measured on 3 August 2026 against minimax-m2.5 (Parasail) and minimax-m3
// (AtlasCloud), so it is the model rather than one provider:
//
//   - every system message after the first is concatenated onto the leading
//     one. The clock, the toy state and the ambient cue ride a trailing system
//     message (liveStateMessage, AMBIENT_CUE) precisely so they read as the
//     last thing said; on MiniMax they arrive ahead of the conversation.
//   - reasoning is streamed inside `content` as a <think> block instead of in
//     reasoning_details, so it is spoken by TTS and stored as dialogue.
export const DEFAULT_MODEL = 'xiaomi/mimo-v2.5:nitro';
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;
export const DEFAULT_PASSES_REASONING = true;
// Middling on both counts: a companion who fills a silence without talking over
// you. A pack says otherwise by setting them.
export const DEFAULT_CHATTINESS = 3;
export const DEFAULT_PLAYFULNESS = 3;
export const DEFAULT_USES_REAL_TIME = true;
export const DEFAULT_KNOWS_USER_TIME = true;

export const COMPANIONS: Record<string, Companion> = {
  'autogoon.aimee': {
    id: 'autogoon.aimee',
    name: 'Aimee',
    description:
      'A sweet, eager-to-please girlfriend who lets you lead - and tease.',
    intro:
      "Aimee is 23, from just outside Manchester, and she's your girlfriend. Warm, sweet-natured and a little shy, with no interest at all in rushing anything. What she loves most is pleasing you, and she'll happily let you set the pace and tell her she's getting it right.\n\nYou've been apart for weeks and the calls are what you've got. She's curled up on her bed with the phone against her ear. She's missed you, she has nowhere to be, and she wants nothing tonight except to make you feel good.",
    gender: 'female',
    accentColour: 'emerald',
    voiceId: 'WLWvwOJfGYaBppWieVa7',
    systemPrompt: AIMEE_SYSTEM_PROMPT,
    model: DEFAULT_MODEL,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    passesReasoning: DEFAULT_PASSES_REASONING,
    chattiness: DEFAULT_CHATTINESS,
    playfulness: DEFAULT_PLAYFULNESS,
    timezone: 'Europe/London',
    usesRealTime: true,
    knowsUserTime: true,
  },
  'autogoon.miley': {
    id: 'autogoon.miley',
    name: 'Miley',
    description:
      'A dry, dressed-up Portland pro - up for anything, no strings.',
    intro:
      "Miley is 30 and does phone sex for a living. You're a client who called her; she's never met you, you don't know anything about her, and neither of you is pretending the call is about anything but her getting you off.\n\nShe doesn't know anything about you.",
    gender: 'female',
    accentColour: 'violet',
    voiceId: 'TsdN21EAs7m8pjYUDEQ1',
    systemPrompt: MILEY_SYSTEM_PROMPT,
    model: DEFAULT_MODEL,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    passesReasoning: DEFAULT_PASSES_REASONING,
    // She's working, and dead air is bad service — but her deadpan needs a beat,
    // so she's short of the top out of play and at it once things are running.
    chattiness: 4,
    playfulness: 5,
    timezone: 'America/Los_Angeles',
    usesRealTime: true,
    // Her setup has her not knowing where he is unless he says, and never
    // assuming he shares her time of day.
    knowsUserTime: false,
  },
};

// The picker order, derived from COMPANIONS: alphabetical by name.
export const companionList: Companion[] = Object.values(COMPANIONS).sort(
  (a, b) => a.name.localeCompare(b.name),
);
