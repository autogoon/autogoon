import { AIMEE_SYSTEM_PROMPT } from './aimee-prompt';
import { MILEY_SYSTEM_PROMPT } from './miley-prompt';

// The built-in companions. One persona = one entry: its voice, model and
// system prompt travel together here as pure data, so a new built-in is a new
// entry, nothing else — and imported goonpacks add further companions at
// runtime (src/lib/goonpacks/). The picker, the play session and the saved
// thread all key off a companion's id.
// Ids are `publisher.name` (see src/lib/goonpacks/manifest.ts) — the stock
// companions here use the "autogoon" publisher.
export type CompanionId = string;

// A picture a companion can send. `src` is a session-scoped object URL,
// created when an imported goonpack's zip is unzipped for play (built-ins
// ship pictureless — a picture only reaches one via an overlay pack, see
// src/lib/goonpacks/); `description` is what the model reads to pick a
// fitting one, from the pack's <basename>.txt sidecar, or "" when there's
// none. `ref` is the thread-stable reference (see below) — object URLs die
// with the session, so the thread persists `ref` instead and resolves it
// against whatever's currently loaded.
export type CompanionPicture = {
  src: string;
  description: string;
  ref?: string; // stable thread ref (goonpack:<packId>/<name>); packs only
};

export type Companion = {
  id: CompanionId; // stable key — picker selection, thread namespace
  name: string;
  description: string; // one-line blurb shown on the picker card
  gender: 'female' | 'male' | 'nonbinary'; // display-only; not currently rendered anywhere
  accentColour: string; // her signature colour name, e.g. "pink" or "emerald"
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window, in tokens (for future pruning; not yet read)
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
  // How readily she fills a silence, 1–5, as two separate appetites: the
  // conversational one and the one for talking over a running program. They are
  // deliberately independent — a laconic persona can still narrate play
  // relentlessly — and each sets its own ambient cadence (see
  // ambientDelayMs).
  chattiness: number; // out of play: how much she keeps a conversation going
  playfulness: number; // during play: how much she talks over the device
  // The pictures she can send during a call — filled by an installed goonpack
  // (src/lib/goonpacks/). Empty (or omitted) for a companion with no pack
  // installed: the panel then offers no send_picture tool, and her prompt gets
  // no picture section.
  pictures?: CompanionPicture[];
};

// App defaults a pack manifest may omit (spec: model/contextWindow/
// passesReasoning "default to the app's current defaults").
// `:nitro` sorts OpenRouter's providers by throughput instead of its default
// price-weighted load balancing — a companion's reply is spoken, so time to
// first token is what the conversation feels like.
export const DEFAULT_MODEL = 'minimax/minimax-m3:nitro';
// MiniMax M3's providers on OpenRouter serve a 1,000,000-token window.
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;
export const DEFAULT_PASSES_REASONING = true;
// Middling on both counts: a companion who fills a silence without talking over
// you. A pack says otherwise by setting them.
export const DEFAULT_CHATTINESS = 3;
export const DEFAULT_PLAYFULNESS = 3;

export const COMPANIONS: Record<string, Companion> = {
  'autogoon.aimee': {
    id: 'autogoon.aimee',
    name: 'Aimee',
    description:
      'A sweet, eager-to-please girlfriend who lets you lead - and tease.',
    gender: 'female',
    accentColour: 'emerald',
    voiceId: 'WLWvwOJfGYaBppWieVa7',
    systemPrompt: AIMEE_SYSTEM_PROMPT,
    model: DEFAULT_MODEL,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    passesReasoning: DEFAULT_PASSES_REASONING,
    chattiness: DEFAULT_CHATTINESS,
    playfulness: DEFAULT_PLAYFULNESS,
  },
  'autogoon.miley': {
    id: 'autogoon.miley',
    name: 'Miley',
    description:
      'A dry, dressed-up Portland pro - up for anything, no strings.',
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
  },
};

// The picker order, derived from the one source above: alphabetical by name.
export const companionList: Companion[] = Object.values(COMPANIONS).sort(
  (a, b) => a.name.localeCompare(b.name),
);
