import { describe, expect, it } from "@jest/globals";
import { strToU8, zipSync } from "fflate";
import { PackError } from "./manifest";
import { parsePack } from "./pack";

const manifest = (extra: object = {}) =>
  strToU8(
    JSON.stringify({ format: 1, id: "test.pack", version: "1.0.0", ...extra }),
  );
const complete = (extra: object = {}) =>
  manifest({ name: "Testy", voiceId: "v123", ...extra });

describe("parsePack", () => {
  it("parses a complete pack with pictures and sidecars", () => {
    const zip = zipSync({
      "manifest.json": complete(),
      "system-prompt.md": strToU8("You are Testy."),
      "pictures/a.jpg": new Uint8Array([1, 2, 3]),
      "pictures/a.txt": strToU8("desc a"),
      "pictures/b.png": new Uint8Array([4]),
    });
    const pack = parsePack(zip);
    expect(pack.manifest.id).toBe("test.pack");
    expect(pack.systemPrompt).toBe("You are Testy.");
    expect(pack.pictures).toHaveLength(2);
    expect(pack.pictures[0]).toMatchObject({
      name: "a",
      description: "desc a",
      mimeType: "image/jpeg",
    });
    expect(pack.pictures[1]).toMatchObject({ name: "b", description: "" });
  });
  it("accepts an overlay with nothing but a manifest", () => {
    const zip = zipSync({
      "manifest.json": manifest({ base: "autogoon.aimee" }),
    });
    expect(parsePack(zip).pictures).toEqual([]);
  });
  it("rejects a complete pack missing prompt/name/voiceId", () => {
    expect(() => parsePack(zipSync({ "manifest.json": complete() }))).toThrow(
      /system-prompt/,
    );
    expect(() =>
      parsePack(
        zipSync({
          "manifest.json": manifest({ voiceId: "v" }),
          "system-prompt.md": strToU8("x"),
        }),
      ),
    ).toThrow(PackError);
  });
  it("rejects a zip without a root manifest, hinting at folder-zips", () => {
    const zip = zipSync({ "pack/manifest.json": complete() });
    expect(() => parsePack(zip)).toThrow(/root/);
  });
  it("rejects duplicate picture stems across extensions", () => {
    const zip = zipSync({
      "manifest.json": manifest({ base: "autogoon.aimee" }),
      "pictures/a.jpg": new Uint8Array([1]),
      "pictures/a.png": new Uint8Array([2]),
    });
    expect(() => parsePack(zip)).toThrow(PackError);
    expect(() => parsePack(zip)).toThrow(/duplicate/);
  });
  it("rejects unsupported files under pictures/", () => {
    const zip = zipSync({
      "manifest.json": manifest({ base: "autogoon.aimee" }),
      "pictures/a.gif": new Uint8Array([1]),
    });
    expect(() => parsePack(zip)).toThrow(PackError);
  });
  it("ignores macOS zip junk", () => {
    const zip = zipSync({
      "manifest.json": manifest({ base: "autogoon.aimee" }),
      "__MACOSX/._manifest.json": new Uint8Array([0]),
      ".DS_Store": new Uint8Array([0]),
      "pictures/.DS_Store": new Uint8Array([0]),
    });
    expect(parsePack(zip).pictures).toEqual([]);
  });
  it("rejects an unreadable zip", () => {
    expect(() => parsePack(new Uint8Array([9, 9, 9]))).toThrow(PackError);
  });
});
