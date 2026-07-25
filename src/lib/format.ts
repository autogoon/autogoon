// Small formatting helpers shared across the UI.

// Milliseconds as m:ss (e.g. 90_000 -> "1:30").
export function formatMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
