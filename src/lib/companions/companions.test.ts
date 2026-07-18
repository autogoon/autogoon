import { describe, it, expect } from "@jest/globals";
import { ELISE, CANNED_REPLY } from "./companions";

describe("Elise", () => {
  it("has the configured voice id and presentation", () => {
    expect(ELISE.voiceId).toBe("exHJXWRRhHzWYCoZrSF1");
    expect(ELISE.gender).toBe("female");
    expect(ELISE.name).toBe("Elise");
  });

  it("has a canned reply long enough to barge in on (~11s of speech)", () => {
    const words = CANNED_REPLY.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(25);
  });
});
