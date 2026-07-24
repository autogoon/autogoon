"use client";

// A centered date row marking where the transcript crosses into a new local
// day (and above the first stamped message).

export function DateHeader({ at }: { at: number }) {
  const showYear = new Date(at).getFullYear() !== new Date().getFullYear();
  return (
    <div className="text-muted-foreground py-1 text-center text-xs">
      {new Date(at).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        ...(showYear ? { year: "numeric" } : {}),
      })}
    </div>
  );
}
