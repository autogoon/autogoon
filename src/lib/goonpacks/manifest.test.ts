import { describe, expect, it } from "@jest/globals";
import { PackError, parseManifest } from "./manifest";

const good = {
  format: 1,
  id: "g00ner.aimee",
  version: "1.0.0",
  aboutThePack: "a test pack",
};

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
  it("rejects name and gender on an overlay — the base's are kept", () => {
    const overlay = { ...good, base: "autogoon.aimee" };
    expect(() =>
      parseManifest({ ...overlay, companion: { name: "Amy" } }),
    ).toThrow(/can't change a companion's name/);
    expect(() =>
      parseManifest({ ...overlay, companion: { gender: "female" } }),
    ).toThrow(/can't change a companion's gender/);
  });
  it("accepts noPictures on an overlay, rejects it elsewhere", () => {
    const overlay = { ...good, base: "autogoon.aimee" };
    expect(parseManifest({ ...overlay, noPictures: true }).noPictures).toBe(
      true,
    );
    expect(() => parseManifest({ ...good, noPictures: true })).toThrow(
      /for overlay packs/,
    );
    expect(() => parseManifest({ ...overlay, noPictures: "yes" })).toThrow(
      PackError,
    );
  });
  it("requires aboutThePack", () => {
    expect(() => parseManifest({ ...good, aboutThePack: undefined })).toThrow(
      /aboutThePack/,
    );
    expect(() => parseManifest({ ...good, aboutThePack: "" })).toThrow(
      /aboutThePack/,
    );
  });
  it("rejects an unknown accentColour", () => {
    expect(() =>
      parseManifest({ ...good, companion: { accentColour: "mauve" } }),
    ).toThrow(PackError);
    expect(
      parseManifest({ ...good, companion: { accentColour: "teal" } }).companion
        .accentColour,
    ).toBe("teal");
  });
  it("rejects a bad gender", () => {
    expect(() =>
      parseManifest({ ...good, companion: { gender: "robot" } }),
    ).toThrow(PackError);
  });
  it("rejects unknown fields at either level — typos never pass silently", () => {
    expect(() => parseManifest({ ...good, name: "Amy" })).toThrow(
      "Unknown field at the top level of manifest.json: name.",
    );
    expect(() => parseManifest({ ...good, accentColor: "teal" })).toThrow(
      "Unknown field at the top level of manifest.json: accentColor.",
    );
    expect(() =>
      parseManifest({ ...good, companion: { voiceID: "v" } }),
    ).toThrow("Unknown field in the companion section: voiceID.");
  });
  it("rejects a companion field that isn't a section", () => {
    expect(() => parseManifest({ ...good, companion: "Amy" })).toThrow(
      /companion field must be a section/,
    );
  });
  it("rejects non-object input", () => {
    expect(() => parseManifest("nope")).toThrow(PackError);
  });
  it("collects every problem, not just the first", () => {
    let thrown: unknown;
    try {
      parseManifest({ format: 1, id: "g00ner.aimee", base: "autogoon.aimee" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PackError);
    expect((thrown as PackError).problems).toEqual([
      "manifest.json is missing the version field - this is the version number of your pack",
      "manifest.json is missing the aboutThePack field — say what the pack adds or changes.",
    ]);
  });
});
