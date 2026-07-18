export type Companion = {
  name: string;
  gender: "female" | "male" | "nonbinary";
  voiceId: string; // ElevenLabs voice id — not a secret; safe in code.
  // systemPrompt / generationBias / initiative / agency arrive in later slices.
};

export const ELISE: Companion = {
  name: "Elise",
  gender: "female",
  voiceId: "exHJXWRRhHzWYCoZrSF1",
};

// A fixed reply for Slice 1 (no LLM yet). ~33 words ≈ 11s spoken.
export const CANNED_REPLY =
  "Mmm, hi baby. I was starting to think you'd forgotten about me. " +
  "Don't keep me waiting like that — you know I get restless. " +
  "Come here and tell me what you've been thinking about.";
