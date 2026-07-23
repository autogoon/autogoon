import { ELISE_SYSTEM_PROMPT } from "./elise-prompt";
import { AIMEE_SYSTEM_PROMPT } from "./aimee-prompt";
import { COMPANION_PICTURES } from "./companion-pictures.generated";

// The companions the user can pick from. One persona = one entry: its voice,
// model and system prompt travel together here as pure data, so a new companion
// is a new entry, nothing else. The picker, the play session and the saved
// thread all key off the chosen entry.
export type CompanionId = "elise" | "aimee";

// A picture a companion can send. `src` is a public path (files live in
// public/companions/<id>/…, served from the site root); `description` is what
// the model reads to pick a fitting one — sourced at build time from a sidecar
// <basename>.txt beside the image, or "" when there's no such file.
export type CompanionPicture = {
  src: string;
  description: string;
};

export type Companion = {
  id: CompanionId; // stable key — picker selection, thread namespace
  name: string;
  description: string; // one-line blurb shown on the picker card
  gender: "female" | "male" | "nonbinary"; // display-only; not currently rendered anywhere
  accent_colour: string; // her signature colour name, e.g. "pink" or "emerald"
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window, in tokens (for future pruning; not yet read)
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
  // The pictures she can send during a call — globbed from public/companions/
  // <id>/ at build time into companion-pictures.generated.ts. Empty (or omitted)
  // for a companion with no pictures: the panel then offers no send_picture
  // tool, and her prompt gets no picture section.
  pictures?: CompanionPicture[];
};

export const COMPANIONS: Record<CompanionId, Companion> = {
  elise: {
    id: "elise",
    name: "Elise",
    description: "A high-energy, flirty streamer with a dry, quieter side.",
    gender: "female",
    accent_colour: "fuchsia",
    // voiceId: "exHJXWRRhHzWYCoZrSF1", // sexy
    voiceId: "uhseMNDjn3oAF24Hh83b", // normal
    systemPrompt: ELISE_SYSTEM_PROMPT,
    model: "minimax/minimax-m3",
    // MiniMax M3's providers on OpenRouter serve a 1,000,000-token window.
    contextWindow: 1_000_000,
    passesReasoning: true,
  },
  aimee: {
    id: "aimee",
    name: "Aimee",
    description:
      "A sweet, eager-to-please girlfriend who lets you lead - and tease.",
    gender: "female",
    accent_colour: "emerald",
    voiceId: "WLWvwOJfGYaBppWieVa7",
    systemPrompt: AIMEE_SYSTEM_PROMPT,
    model: "minimax/minimax-m3",
    // Same model as Elise — MiniMax M3, 1,000,000-token window on OpenRouter.
    contextWindow: 1_000_000,
    passesReasoning: true,
    // Globbed from public/companions/aimee/ at build time — drop images in that
    // folder, with an optional <basename>.txt description beside each; they're
    // picked up on the next dev/build.
    pictures: COMPANION_PICTURES.aimee,
  },
};

// The picker order, derived from the one source above: alphabetical by name.
export const companionList: Companion[] = Object.values(COMPANIONS).sort(
  (a, b) => a.name.localeCompare(b.name),
);
