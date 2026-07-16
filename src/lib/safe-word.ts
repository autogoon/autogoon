// The safe word — the always-on voice hard stop. One user-configurable word
// (persisted under SAFE_WORD_STORAGE_KEY) that halts the Player exactly like
// Stop, wired globally in page.tsx so no algorithm can ever gate it. This
// module is just the pure bits: the default and the validator.

export const DEFAULT_SAFE_WORD = "pineapple";
export const SAFE_WORD_STORAGE_KEY = "autogoon-safe-word";

// A candidate must survive as a single lowercase a–z word (vosk grammar
// entries are single lowercase words) and must not be a word the grammar
// already routes elsewhere. Returns the cleaned word, or null if invalid.
export function sanitizeSafeWord(
  input: string,
  reserved: readonly string[],
): string | null {
  const word = input.trim().toLowerCase();
  if (!/^[a-z]+$/.test(word)) return null;
  if (reserved.includes(word)) return null;
  return word;
}
