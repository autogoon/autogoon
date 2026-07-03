"use client";

// How much of the API rate-limit budget is left in the trailing 60s window. We
// track it ourselves (the server's x-ratelimit-* counters aren't readable
// cross-origin), so it's an estimate of our own traffic.

import type { RateLimitStatus } from "@/lib/vacuglide-device";

export function RateLimitMeter({
  used,
  remaining,
  limit,
  resetSeconds,
}: RateLimitStatus) {
  const frac = limit > 0 ? Math.min(1, used / limit) : 0;
  const low = remaining <= limit * 0.15;
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
      <span>API</span>
      <div className="bg-foreground/10 h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${low ? "bg-destructive" : "bg-emerald-500"}`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <span>
        {remaining}/{limit} left
        {resetSeconds > 0 ? ` · resets in ${resetSeconds}s` : ""}
      </span>
    </div>
  );
}
