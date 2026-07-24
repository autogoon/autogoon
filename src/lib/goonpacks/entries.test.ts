import { describe, expect, it } from "@jest/globals";
import { companionList } from "@/lib/companions/companions";
import { buildEntries, publisher, type LoadedPack } from "./entries";
import type { PackManifest } from "./manifest";

const manifest = (id: string, extra: object = {}): PackManifest => ({
  format: 1,
  id,
  version: "1.0.0",
  aboutThePack: "a test pack",
  ...extra,
});
const NO_EXTRAS = { pictures: 0, hasPrompt: false };
const complete = (
  id: string,
  name: string,
  summary = NO_EXTRAS,
): LoadedPack => ({
  manifest: manifest(id, { name, voiceId: "v" }),
  summary,
});
const overlay = (
  id: string,
  base: string,
  extra: object = {},
  summary = NO_EXTRAS,
): LoadedPack => ({
  manifest: manifest(id, { base, ...extra }),
  summary,
});

// Built-in ids in picker order, for asserting built-ins stay first and
// alphabetical (companionList's own order — see companions.ts).
const BUILT_IN_IDS = companionList.map((c) => c.id);

// Built-ins ship pictureless, so a default variant's effective count is 0.
const DEFAULT_VARIANT = {
  packId: null,
  label: "default",
  pictures: 0,
  changed: [],
};

describe("publisher", () => {
  it("reads the half before the dot", () => {
    expect(publisher("g00ner.aimee")).toBe("g00ner");
  });
});

describe("buildEntries", () => {
  it("no packs: only built-ins, each with just the default variant", () => {
    const entries = buildEntries([]);
    expect(entries.map((e) => e.companion.id)).toEqual(BUILT_IN_IDS);
    for (const e of entries) {
      expect(e.builtIn).toBe(true);
      expect(e.variants).toEqual([DEFAULT_VARIANT]);
    }
  });

  it("an imported complete pack and an overlay on a built-in", () => {
    const base = BUILT_IN_IDS[0]!;
    const packs = [
      complete("pub.complete", "Complete"),
      overlay("pub.overlay", base),
    ];
    const entries = buildEntries(packs);
    // Built-ins first (companionList order), then completes, in pack order.
    expect(entries.map((e) => e.companion.id)).toEqual([
      ...BUILT_IN_IDS,
      "pub.complete",
    ]);
    const baseEntry = entries.find((e) => e.companion.id === base)!;
    expect(baseEntry.variants).toEqual([
      DEFAULT_VARIANT,
      {
        packId: "pub.overlay",
        label: "pub",
        version: "1.0.0",
        pictures: 0,
        changed: [],
      },
    ]);
    const completeEntry = entries.find(
      (e) => e.companion.id === "pub.complete",
    )!;
    expect(completeEntry.builtIn).toBe(false);
    expect(completeEntry.variants).toEqual([DEFAULT_VARIANT]);
  });

  it("variants carry the selection's description, accent, pictures and changed slots", () => {
    const base = BUILT_IN_IDS[0]!;
    const packs = [
      overlay(
        "pub.goth",
        base,
        {
          description: "her goth era",
          accentColour: "violet",
          voiceId: "v-goth",
        },
        { pictures: 5, hasPrompt: true },
      ),
      overlay("pub.quiet", base, { noPictures: true }),
    ];
    const entries = buildEntries(packs);
    const [, goth, quiet] = entries.find(
      (e) => e.companion.id === base,
    )!.variants;
    expect(goth).toEqual({
      packId: "pub.goth",
      label: "pub",
      version: "1.0.0",
      description: "her goth era",
      accent: "violet",
      pictures: 5,
      changed: ["pictures", "prompt", "voice", "colour"],
    });
    // noPictures: deliberately zero, and "pictures" counts as changed.
    expect(quiet).toEqual({
      packId: "pub.quiet",
      label: "pub",
      version: "1.0.0",
      pictures: 0,
      changed: ["pictures"],
    });
  });

  it("a pictureless overlay inherits the base pack's picture count", () => {
    const packs = [
      complete("pub.complete", "Complete", { pictures: 7, hasPrompt: true }),
      overlay("pub.voice", "pub.complete", { voiceId: "v2" }),
    ];
    const entries = buildEntries(packs);
    const entry = entries.find((e) => e.companion.id === "pub.complete")!;
    expect(entry.variants[0]!.pictures).toBe(7);
    expect(entry.variants[1]).toMatchObject({
      pictures: 7,
      changed: ["voice"],
    });
  });
});
