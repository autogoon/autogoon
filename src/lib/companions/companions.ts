import type { MediaKind } from '@/lib/goonpacks/media';
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

// One thing a companion can send: a still or a video. Both texts come from the
// pack's <basename>.md sidecar: `caption` is the one line the model reads to
// pick a fitting one, `description` the long prose behind it. `ref` is the
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
  ref: string;
  src?: string;
  load(): Promise<string>;
  // Drop the memoised URL: the next `load()` reads the file again, or fails and
  // renders as missing if it has gone.
  forget(): void;
};

export type Companion = {
  id: CompanionId; // stable key — picker selection, thread namespace
  name: string;
  description: string; // one-line blurb shown on the picker card
  gender: 'female' | 'male' | 'nonbinary'; // display-only; not currently rendered anywhere
  accentColour: string; // their signature colour name, e.g. "pink" or "emerald"
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  // The chosen model's context window, in tokens. Nothing reads it yet —
  // deliberately captured anyway, because it belongs to whoever picked `model`.
  // Compaction (TODO.md) is what will need it, and a pack authored before then
  // would otherwise have to be revisited to supply a number its author knew all
  // along. Cheap to carry, expensive to backfill across every pack in the wild.
  contextWindow: number;
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
  // How readily this companion fills a silence, 1–5, as two separate appetites:
  // the conversational one and the one for talking over a running program. They
  // are deliberately independent — a laconic persona can still narrate play
  // relentlessly — and each sets its own ambient cadence (see
  // ambientDelayMs).
  chattiness: number; // out of play: how much they keep a conversation going
  playfulness: number; // during play: how much they talk over the device
  // The media they can send during a call — filled by an installed goonpack
  // (src/lib/goonpacks/). Empty (or omitted) for a companion with no pack
  // installed: the panel then offers no send_media tool, and their prompt gets
  // no media section.
  media?: CompanionMedia[];
  // What that set holds, as one block of text — present whenever `media` is,
  // because a pack carrying media must carry a summary of it (parsePack).
  // Written by npm run goonpack:summarise; nothing here reads into it.
  mediaSummary?: string;
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
