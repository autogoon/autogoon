import { ELISE_SYSTEM_PROMPT } from "./elise-prompt";

export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary"; // display-only, shown on the picker
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window, in tokens
  passesReasoning: boolean; // replay reasoning_details in history (reasoning models)
};

export const ELISE: Companion = {
  name: "Elise",
  gender: "female",
  // voiceId: "exHJXWRRhHzWYCoZrSF1", // sexy
  voiceId: "uhseMNDjn3oAF24Hh83b", // normal
  systemPrompt: ELISE_SYSTEM_PROMPT,
  model: "minimax/minimax-m3",
  // MiniMax M3's providers on OpenRouter serve a 1,000,000-token window.
  contextWindow: 1_000_000,
  passesReasoning: true,
};
