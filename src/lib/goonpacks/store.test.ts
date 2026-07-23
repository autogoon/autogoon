import { describe, expect, it } from "@jest/globals";
import { readIndex, reconcile, toIndexEntry, writeIndex } from "./store";

const entry = (id: string, extra: object = {}) => ({
  id,
  version: "1.0.0",
  ...extra,
});

describe("reconcile", () => {
  it("flags index entries with no stored record as missing", () => {
    const { healed, missing } = reconcile(
      [entry("a.b"), entry("c.d")],
      [entry("a.b")],
    );
    expect(missing).toEqual([entry("c.d")]);
    expect(healed).toHaveLength(2);
  });
  it("heals records the index forgot", () => {
    const { healed, missing } = reconcile([], [entry("a.b")]);
    expect(missing).toEqual([]);
    expect(healed).toEqual([entry("a.b")]);
  });
  it("prefers the stored record's data over a stale index entry", () => {
    const { healed } = reconcile(
      [entry("a.b", { version: "0.9" })],
      [entry("a.b")],
    );
    expect(healed).toEqual([entry("a.b")]);
  });
});

describe("index round-trip", () => {
  // Minimal Storage stand-in — only what read/writeIndex touch.
  const fake = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    } as Storage;
  };
  it("round-trips entries", () => {
    const s = fake();
    writeIndex(s, [entry("a.b")]);
    expect(readIndex(s)).toEqual([entry("a.b")]);
  });
  it("treats garbage as empty", () => {
    const s = fake();
    s.setItem("goonpacks:index", "{nope");
    expect(readIndex(s)).toEqual([]);
  });
  it("derives an entry from a manifest", () => {
    expect(
      toIndexEntry({
        format: 1,
        id: "a.b",
        version: "2",
        name: "B",
        base: "c.d",
      }),
    ).toEqual({ id: "a.b", version: "2", name: "B", base: "c.d" });
  });
});
