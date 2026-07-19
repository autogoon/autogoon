import { describe, it, expect } from "@jest/globals";
import { ELISE } from "./companions";

describe("Elise", () => {
  it("has the configured voice id and presentation", () => {
    expect(ELISE.voiceId).toBe("exHJXWRRhHzWYCoZrSF1");
    expect(ELISE.gender).toBe("female");
    expect(ELISE.name).toBe("Elise");
  });
});
