import { describe, expect, it } from "@jest/globals";
import { companionList } from "@/lib/companions/companions";
import { buildEntries, publisher } from "./entries";
import type { PackManifest } from "./manifest";
import type { IndexEntry } from "./store";

const manifest = (id: string, extra: object = {}): PackManifest => ({
  format: 1,
  id,
  version: "1.0.0",
  ...extra,
});
const complete = (id: string, name: string): PackManifest =>
  manifest(id, { name, voiceId: "v" });
const overlay = (id: string, base: string): PackManifest =>
  manifest(id, { base });
const index = (id: string, extra: object = {}): IndexEntry => ({
  id,
  version: "1.0.0",
  ...extra,
});

// Built-in ids in picker order, for asserting built-ins stay first and
// alphabetical (companionList's own order — see companions.ts).
const BUILT_IN_IDS = companionList.map((c) => c.id);

describe("publisher", () => {
  it("reads the half before the dot", () => {
    expect(publisher("g00ner.aimee")).toBe("g00ner");
  });
});

describe("buildEntries", () => {
  it("empty everything: only built-ins, each with just the default variant", () => {
    const entries = buildEntries([], []);
    expect(entries.map((e) => e.companion.id)).toEqual(BUILT_IN_IDS);
    for (const e of entries) {
      expect(e.builtIn).toBe(true);
      expect(e.missing).toBe(false);
      expect(e.variants).toEqual([
        { packId: null, label: "default", missing: false },
      ]);
    }
  });

  it("all live: an imported complete pack and a live overlay on a built-in", () => {
    const base = BUILT_IN_IDS[0]!;
    const manifests = [
      complete("pub.complete", "Complete"),
      overlay("pub.overlay", base),
    ];
    const entries = buildEntries(manifests, []);
    // Built-ins first (companionList order), then completes, in manifest order.
    expect(entries.map((e) => e.companion.id)).toEqual([
      ...BUILT_IN_IDS,
      "pub.complete",
    ]);
    const baseEntry = entries.find((e) => e.companion.id === base)!;
    expect(baseEntry.variants).toEqual([
      { packId: null, label: "default", missing: false },
      { packId: "pub.overlay", label: "pub", version: "1.0.0", missing: false },
    ]);
    const completeEntry = entries.find(
      (e) => e.companion.id === "pub.complete",
    )!;
    expect(completeEntry.builtIn).toBe(false);
    expect(completeEntry.missing).toBe(false);
    expect(completeEntry.variants).toEqual([
      { packId: null, label: "default", missing: false },
    ]);
  });

  it("evicted complete pack: placeholder entry, its live overlay still listed", () => {
    const missing = [index("pub.complete", { name: "Complete" })];
    const manifests = [overlay("other.o", "pub.complete")];
    const entries = buildEntries(manifests, missing);
    const placeholder = entries.find((e) => e.companion.id === "pub.complete")!;
    expect(placeholder.missing).toBe(true);
    expect(placeholder.builtIn).toBe(false);
    expect(placeholder.variants).toEqual([
      { packId: null, label: "default", missing: false },
      { packId: "other.o", label: "other", version: "1.0.0", missing: false },
    ]);
  });

  it("evicted overlay under a live base: variant flagged missing, base unaffected", () => {
    const base = BUILT_IN_IDS[0]!;
    const missing = [index("pub.overlay", { base, name: "gone" })];
    const entries = buildEntries([], missing);
    const baseEntry = entries.find((e) => e.companion.id === base)!;
    expect(baseEntry.missing).toBe(false);
    expect(baseEntry.variants).toEqual([
      { packId: null, label: "default", missing: false },
      { packId: "pub.overlay", label: "pub", version: "1.0.0", missing: true },
    ]);
  });

  it("evicted base with a live overlay: overlay listed under the placeholder", () => {
    const missing = [index("pub.complete", { name: "Complete" })];
    const manifests = [overlay("live.o", "pub.complete")];
    const entries = buildEntries(manifests, missing);
    const placeholder = entries.find((e) => e.companion.id === "pub.complete")!;
    expect(placeholder.missing).toBe(true);
    expect(placeholder.variants).toEqual([
      { packId: null, label: "default", missing: false },
      { packId: "live.o", label: "live", version: "1.0.0", missing: false },
    ]);
  });
});
