import { describe, it, expect } from "@jest/globals";
import { ELISE } from "./companions";

describe("Elise", () => {
  it("has a voice id and the configured presentation", () => {
    // The exact voiceId is config we swap while tuning Elise's voice, so assert
    // it's set rather than pinning a specific id.
    expect(typeof ELISE.voiceId).toBe("string");
    expect(ELISE.voiceId.length).toBeGreaterThan(0);
    expect(ELISE.gender).toBe("female");
    expect(ELISE.name).toBe("Elise");
  });
});
