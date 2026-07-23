import { describe, it, expect } from "@jest/globals";
import { COMPANIONS } from "./companions";

describe("Elise", () => {
  const elise = COMPANIONS["autogoon.elise"]!;

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

describe("Aimee", () => {
  const aimee = COMPANIONS["autogoon.aimee"]!;

  it("has a voice id and the configured presentation", () => {
    expect(typeof aimee.voiceId).toBe("string");
    expect(aimee.voiceId.length).toBeGreaterThan(0);
    expect(aimee.gender).toBe("female");
    expect(aimee.name).toBe("Aimee");
  });
});

describe("Miley", () => {
  const miley = COMPANIONS["autogoon.miley"]!;

  it("has a voice id and the configured presentation", () => {
    expect(typeof miley.voiceId).toBe("string");
    expect(miley.voiceId.length).toBeGreaterThan(0);
    expect(miley.gender).toBe("female");
    expect(miley.name).toBe("Miley");
  });
});

describe("COMPANIONS registry", () => {
  it("keys each companion by its own id", () => {
    for (const [id, companion] of Object.entries(COMPANIONS)) {
      expect(companion.id).toBe(id);
    }
  });
});
