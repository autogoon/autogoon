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
  it("rejects a pack overlaying itself", () => {
    expect(() => parseManifest({ ...good, base: good.id })).toThrow(PackError);
  });
  it("rejects name and gender on an overlay — she keeps hers", () => {
    const overlay = { ...good, base: "autogoon.aimee" };
    expect(() => parseManifest({ ...overlay, name: "Amy" })).toThrow(
      /keeps her name/,
    );
    expect(() => parseManifest({ ...overlay, gender: "female" })).toThrow(
      /keeps her gender/,
    );
  });
  it("accepts noPictures on an overlay, rejects it elsewhere", () => {
    const overlay = { ...good, base: "autogoon.aimee" };
    expect(parseManifest({ ...overlay, noPictures: true }).noPictures).toBe(
      true,
    );
    expect(() => parseManifest({ ...good, noPictures: true })).toThrow(
      /for overlays/,
    );
    expect(() => parseManifest({ ...overlay, noPictures: "yes" })).toThrow(
      PackError,
    );
  });
  it("passes aboutThePack through", () => {
    expect(
      parseManifest({ ...good, aboutThePack: "adds things" }).aboutThePack,
    ).toBe("adds things");
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
