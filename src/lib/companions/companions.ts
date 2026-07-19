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
