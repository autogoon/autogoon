import { describe, expect, it } from "@jest/globals";
import { migrateThreadKeys } from "./migrate";

function fakeStorage(seed: Record<string, string>) {
  const m = new Map(Object.entries(seed));
  return {
    storage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as Storage,
    map: m,
  };
}

describe("migrateThreadKeys", () => {
  it("renames legacy thread keys to autogoon ids", () => {
    const { storage, map } = fakeStorage({
      "companions:thread:elise": "[thread]",
    });
    migrateThreadKeys(storage);
    expect(map.get("companions:thread:autogoon.elise")).toBe("[thread]");
    expect(map.has("companions:thread:elise")).toBe(false);
  });
  it("never overwrites an existing new-key thread", () => {
    const { storage, map } = fakeStorage({
      "companions:thread:miley": "old",
      "companions:thread:autogoon.miley": "new",
    });
    migrateThreadKeys(storage);
    expect(map.get("companions:thread:autogoon.miley")).toBe("new");
  });
  it("is a no-op with nothing to migrate", () => {
    const { storage, map } = fakeStorage({ other: "x" });
    migrateThreadKeys(storage);
    expect(map.size).toBe(1);
  });
});
