import { ELISE_SYSTEM_PROMPT } from "./elise-prompt";

export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary"; // display-only, shown on the picker
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  systemPrompt: string; // persona; sent as the LLM system message (no model card)
  model: string; // OpenRouter model slug the client requests for this companion
  contextWindow: number; // model context window (tokens); recorded for 4b pruning
  // generationBias / initiative / agency arrive in later slices.
};

export const ELISE: Companion = {
  name: "Elise",
  gender: "female",
  // voiceId: "exHJXWRRhHzWYCoZrSF1", // sexy
  voiceId: "uhseMNDjn3oAF24Hh83b", // normal
  systemPrompt: ELISE_SYSTEM_PROMPT,
  model: "minimax/minimax-m2:nitro",
  // MiniMax M2 is 204,800 nominal, but :nitro may route to a ~196,608 provider;
  // record the conservative value so 4b's pruning is safe whichever serves it.
  contextWindow: 196608,
};
