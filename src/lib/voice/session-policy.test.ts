import { describe, it, expect } from "@jest/globals";
import {
  shouldOpenSocket,
  shouldCloseSocket,
  isBargeIn,
} from "./session-policy";

describe("session-policy", () => {
  it("opens on onset only when closed", () => {
    expect(shouldOpenSocket("closed", true)).toBe(true);
    expect(shouldOpenSocket("closed", false)).toBe(false);
    expect(shouldOpenSocket("open", true)).toBe(false);
    expect(shouldOpenSocket("connecting", true)).toBe(false);
  });

  it("closes an open socket after the quiet timeout", () => {
    expect(shouldCloseSocket("open", 1000, 1000 + 8000, 8000)).toBe(true);
    expect(shouldCloseSocket("open", 1000, 1000 + 7999, 8000)).toBe(false);
    expect(shouldCloseSocket("closed", 0, 999999, 8000)).toBe(false);
  });

  it("is a barge-in only when a reply is playing and speech onsets", () => {
    expect(isBargeIn(true, true)).toBe(true);
    expect(isBargeIn(false, true)).toBe(false);
    expect(isBargeIn(true, false)).toBe(false);
  });
});
