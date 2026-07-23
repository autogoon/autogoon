// One-time localStorage migration: stock companions moved from bare ids to
// autogoon.* when goonpacks landed; carry their saved threads across.
// Idempotent — safe to run on every startup.
const LEGACY_IDS = ["elise", "aimee", "miley"];

export function migrateThreadKeys(storage: Storage): void {
  for (const legacy of LEGACY_IDS) {
    const oldKey = `companions:thread:${legacy}`;
    const newKey = `companions:thread:autogoon.${legacy}`;
    const value = storage.getItem(oldKey);
    if (value === null) continue;
    if (storage.getItem(newKey) === null) storage.setItem(newKey, value);
    storage.removeItem(oldKey);
  }
}
