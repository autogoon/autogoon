"use client";

// Keyword spotting panel — presentation only. All state and audio plumbing
// lives in useKeywordSpotter at the top of the tree, so detection keeps
// running while this panel is hidden behind another tab.

import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import { Card } from "@/components/card";
import { LogCard } from "@/components/log-card";

export function KeywordSpotterPanel({
  kws,
}: {
  kws: KeywordSpotterController;
}) {
  return (
    <section className="flex w-full flex-col gap-4">
      <Card title="Listening for">
        {kws.listeningFor.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No words yet — start an algorithm to publish its voice commands.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {kws.listeningFor.map((word) => (
              <span
                key={word}
                className={`rounded-md border px-2 py-1 font-mono text-sm transition-colors ${
                  kws.flashing.has(word)
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {word}
              </span>
            ))}
          </div>
        )}
      </Card>

      <LogCard title="Log" entries={kws.logEntries} />
    </section>
  );
}
