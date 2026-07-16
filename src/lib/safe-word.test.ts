import { describe, expect, it } from "@jest/globals";
import { DEFAULT_SAFE_WORD, sanitizeSafeWord } from "./safe-word";

// The safe word is a single spoken keyword, so a candidate must survive as one
// lowercase a–z word and must not collide with a word the grammar already
// routes elsewhere (the caller passes those in as `reserved`).

const RESERVED = ["connect", "exit", "settings", "stop", "goon"];

describe("sanitizeSafeWord", () => {
  it("accepts a plain lowercase word", () => {
    expect(sanitizeSafeWord("pineapple", RESERVED)).toBe("pineapple");
  });

  it("trims and lowercases", () => {
    expect(sanitizeSafeWord("  Pineapple \n", RESERVED)).toBe("pineapple");
  });

  it("rejects the empty and whitespace-only string", () => {
    expect(sanitizeSafeWord("", RESERVED)).toBeNull();
    expect(sanitizeSafeWord("   ", RESERVED)).toBeNull();
  });

  it("rejects multiple words", () => {
    expect(sanitizeSafeWord("red light", RESERVED)).toBeNull();
  });

  it("rejects non-letter characters", () => {
    expect(sanitizeSafeWord("pine-apple", RESERVED)).toBeNull();
    expect(sanitizeSafeWord("stop!", RESERVED)).toBeNull();
    expect(sanitizeSafeWord("route66", RESERVED)).toBeNull();
  });

  it("rejects reserved words, case-insensitively", () => {
    expect(sanitizeSafeWord("stop", RESERVED)).toBeNull();
    expect(sanitizeSafeWord("Goon", RESERVED)).toBeNull();
  });

  it("has a default that passes its own validation", () => {
    expect(sanitizeSafeWord(DEFAULT_SAFE_WORD, RESERVED)).toBe(
      DEFAULT_SAFE_WORD,
    );
  });
});
