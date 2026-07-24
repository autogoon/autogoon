import { describe, expect, it } from "@jest/globals";
import { companionList } from "@/lib/companions/companions";
import {
  buildEntries,
  effectivePictures,
  keyId,
  keyVersion,
  newestFirst,
  packKey,
  publisher,
  type LoadedPack,
} from "./entries";
import type { PackManifest } from "./manifest";

const manifest = (
  id: string,
  version: string,
  extra: object = {},
): PackManifest => ({
  format: 1,
  id,
  version,
  aboutThePack: "a test pack",
  ...extra,
});
const NO_EXTRAS = { pictures: 0, hasPrompt: false };
const complete = (
  id: string,
  version: string,
  extra: object = {},
  summary = NO_EXTRAS,
): LoadedPack => ({
  manifest: manifest(id, version, { name: "Comp", voiceId: "v", ...extra }),
  summary,
});
const overlay = (
  id: string,
  version: string,
  base: string,
  extra: object = {},
  summary = NO_EXTRAS,
): LoadedPack => ({
  manifest: manifest(id, version, { base, ...extra }),
  summary,
});

// Built-in ids in picker order, for asserting built-ins stay first and
// alphabetical (companionList's own order — see companions.ts).
const BUILT_IN_IDS = companionList.map((c) => c.id);

describe("keys", () => {
  it("round-trips id and version", () => {
    expect(packKey({ id: "g00ner.aimee", version: "1.0.0" })).toBe(
      "g00ner.aimee@1.0.0",
    );
    expect(keyId("g00ner.aimee@1.0.0")).toBe("g00ner.aimee");
    expect(keyVersion("g00ner.aimee@1.0.0")).toBe("1.0.0");
  });
  it("sorts versions newest first, digits compared as numbers", () => {
    expect(["1.9.0", "1.10.0", "2.0.0"].sort(newestFirst)).toEqual([
      "2.0.0",
      "1.10.0",
      "1.9.0",
    ]);
  });
});

describe("publisher", () => {
  it("reads the half before the dot", () => {
    expect(publisher("g00ner.aimee")).toBe("g00ner");
  });
});

describe("effectivePictures", () => {
  const opt = (extra: object) => ({
    key: "pub.o@1",
    label: "pub",
    pictures: 0,
    changed: [],
    ...extra,
  });
  it("no overlay, or a pictureless overlay, plays the base's set", () => {
    expect(effectivePictures(null, 9)).toBe(9);
    expect(effectivePictures(opt({}), 9)).toBe(9);
  });
  it("an overlay's own set wins; noPictures strips to zero", () => {
    expect(effectivePictures(opt({ pictures: 4 }), 9)).toBe(4);
    expect(effectivePictures(opt({ noPictures: true }), 9)).toBe(0);
  });
});

describe("buildEntries", () => {
  it("no packs: built-ins with one default base and no overlays", () => {
    const entries = buildEntries([]);
    expect(entries.map((e) => e.companion.id)).toEqual(BUILT_IN_IDS);
    for (const e of entries) {
      expect(e.builtIn).toBe(true);
      expect(e.bases).toEqual([
        { key: null, label: "default", pictures: 0, changed: [] },
      ]);
      expect(e.overlays).toEqual([]);
    }
  });

  it("a complete pack's versions share one entry, newest first", () => {
    const packs = [
      complete(
        "pub.comp",
        "1.0.0",
        { description: "old" },
        { pictures: 3, hasPrompt: true },
      ),
      complete(
        "pub.comp",
        "1.10.0",
        { description: "new" },
        { pictures: 5, hasPrompt: true },
      ),
    ];
    const entries = buildEntries(packs);
    expect(entries).toHaveLength(BUILT_IN_IDS.length + 1);
    const entry = entries.find((e) => e.companion.id === "pub.comp")!;
    expect(entry.builtIn).toBe(false);
    // The card's identity follows the newest version.
    expect(entry.companion.description).toBe("new");
    expect(entry.bases.map((b) => b.key)).toEqual([
      "pub.comp@1.10.0",
      "pub.comp@1.0.0",
    ]);
    expect(entry.bases[0]).toMatchObject({
      label: "pub",
      version: "1.10.0",
      pictures: 5,
    });
    expect(entry.overlays).toEqual([]);
  });

  it("overlay versions list newest first with their changed slots", () => {
    const base = BUILT_IN_IDS[0]!;
    const packs = [
      overlay("pub.goth", "1.0.0", base, { voiceId: "v1" }),
      overlay(
        "pub.goth",
        "1.1.0",
        base,
        { voiceId: "v2", accentColour: "violet" },
        { pictures: 4, hasPrompt: false },
      ),
    ];
    const entry = buildEntries(packs).find((e) => e.companion.id === base)!;
    expect(entry.overlays.map((o) => o.key)).toEqual([
      "pub.goth@1.1.0",
      "pub.goth@1.0.0",
    ]);
    expect(entry.overlays[0]).toMatchObject({
      accent: "violet",
      pictures: 4,
      changed: ["pictures", "voice", "colour"],
    });
    expect(entry.overlays[1]!.changed).toEqual(["voice"]);
  });

  it("noPictures flags the overlay option", () => {
    const base = BUILT_IN_IDS[0]!;
    const entry = buildEntries([
      overlay("pub.quiet", "1.0.0", base, { noPictures: true }),
    ]).find((e) => e.companion.id === base)!;
    expect(entry.overlays[0]).toMatchObject({
      noPictures: true,
      changed: ["pictures"],
    });
  });

  it("overlays on a complete pack attach to its entry", () => {
    const packs = [
      complete("pub.comp", "1.0.0", {}, { pictures: 7, hasPrompt: true }),
      overlay("pub.voice", "1.0.0", "pub.comp", { voiceId: "v2" }),
    ];
    const entry = buildEntries(packs).find(
      (e) => e.companion.id === "pub.comp",
    )!;
    expect(entry.overlays.map((o) => o.key)).toEqual(["pub.voice@1.0.0"]);
    // A pictureless overlay inherits the selected base version's set.
    expect(
      effectivePictures(entry.overlays[0]!, entry.bases[0]!.pictures),
    ).toBe(7);
  });
});
