"use client";

// The session's fast-moving loudness bar — repaints every frame; kept small.

export function RmsMeter({
  rms,
  speaking,
}: {
  rms: number;
  speaking: boolean;
}) {
  const pct = Math.min(100, Math.round(rms * 500));
  return (
    <div className="bg-foreground/10 h-2 w-full overflow-hidden rounded">
      <div
        className={`h-full ${speaking ? "bg-emerald-500" : "bg-foreground/30"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
