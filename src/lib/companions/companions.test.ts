import { describe, it, expect } from "@jest/globals";
import { COMPANIONS } from "./companions";

describe("Elise", () => {
  const elise = COMPANIONS.elise;

  it("has a voice id and the configured presentation", () => {
    // The exact voiceId is config we swap while tuning Elise's voice, so assert
    // it's set rather than pinning a specific id.
    expect(typeof elise.voiceId).toBe("string");
    expect(elise.voiceId.length).toBeGreaterThan(0);
    expect(elise.gender).toBe("female");
    expect(elise.name).toBe("Elise");
  });

  it("passes reasoning back to the model (M2 is a reasoning model)", () => {
    expect(elise.passesReasoning).toBe(true);
  });
});

describe("COMPANIONS registry", () => {
  it("keys each companion by its own id", () => {
    for (const [id, companion] of Object.entries(COMPANIONS)) {
      expect(companion.id).toBe(id);
    }
  });
});
