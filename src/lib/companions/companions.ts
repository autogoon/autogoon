import { ELISE_SYSTEM_PROMPT } from "./elise-prompt";

// The companions the user can pick from. One persona = one entry: its voice,
// model and system prompt travel together here as pure data, so a new companion
// is a new entry, nothing else. The picker, the play session and the saved
// thread all key off the chosen entry.
export type CompanionId = "elise";

export type Companion = {
  id: CompanionId; // stable key — picker selection, thread namespace
  name: string;
  description: string; // one-line blurb shown on the picker card
  gender: "female" | "male" | "nonbinary"; // display-only, shown on the picker
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window, in tokens
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
};

export const COMPANIONS: Record<CompanionId, Companion> = {
  elise: {
    id: "elise",
    name: "Elise",
    description: "A high-energy, flirty streamer with a dry, quieter side.",
    gender: "female",
    // voiceId: "exHJXWRRhHzWYCoZrSF1", // sexy
    voiceId: "uhseMNDjn3oAF24Hh83b", // normal
    systemPrompt: ELISE_SYSTEM_PROMPT,
    model: "minimax/minimax-m3",
    // MiniMax M3's providers on OpenRouter serve a 1,000,000-token window.
    contextWindow: 1_000_000,
    passesReasoning: true,
  },
};

// Stable render order for the picker, derived from the one source above.
export const companionList: Companion[] = Object.values(COMPANIONS);

// The companion selected by default when the picker first opens.
export const DEFAULT_COMPANION_ID: CompanionId = "elise";
