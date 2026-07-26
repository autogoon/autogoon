'use client';

// A still or clip from a pack that isn't loaded right now — never substitute.

export function MissingMediaBubble() {
  return (
    <div className="text-muted-foreground max-w-[60%] self-start rounded-xl border border-dashed px-3 py-2 text-xs">
      Media from another pack.
    </div>
  );
}
