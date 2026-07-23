import { describe, expect, it } from "@jest/globals";
import { PackError, parseManifest } from "./manifest";

const good = { format: 1, id: "g00ner.aimee", version: "1.0.0" };

describe("parseManifest", () => {
  it("accepts a minimal overlay manifest", () => {
    expect(parseManifest({ ...good, base: "autogoon.aimee" }).base).toBe(
      "autogoon.aimee",
    );
  });
  it("rejects a newer format", () => {
    expect(() => parseManifest({ ...good, format: 2 })).toThrow(PackError);
  });
  it("rejects missing/invalid format", () => {
    expect(() => parseManifest({ ...good, format: undefined })).toThrow(
      PackError,
    );
  });
  it("rejects bad ids", () => {
    for (const id of ["aimee", "A.b", "a..b", "a.b.c", "a_b.c", ""]) {
      expect(() => parseManifest({ ...good, id })).toThrow(PackError);
    }
  });
  it("requires version as a non-empty string", () => {
    expect(() => parseManifest({ ...good, version: "" })).toThrow(PackError);
    expect(() => parseManifest({ ...good, version: 1 })).toThrow(PackError);
  });
  it("rejects a bad base id", () => {
    expect(() => parseManifest({ ...good, base: "nope" })).toThrow(PackError);
  });
  it("rejects an unknown accentColour", () => {
    expect(() => parseManifest({ ...good, accentColour: "mauve" })).toThrow(
      PackError,
    );
    expect(parseManifest({ ...good, accentColour: "teal" }).accentColour).toBe(
      "teal",
    );
  });
  it("rejects a bad gender", () => {
    expect(() => parseManifest({ ...good, gender: "robot" })).toThrow(
      PackError,
    );
  });
  it("rejects non-object input", () => {
    expect(() => parseManifest("nope")).toThrow(PackError);
  });
});
