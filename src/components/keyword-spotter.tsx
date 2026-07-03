"use client";

// Keyword spotting panel — presentation only. All state and audio plumbing
// lives in useKeywordSpotter at the top of the tree, so detection keeps
// running while this panel is hidden behind another tab. The live grammar is
// shown per-algorithm via <ListeningFor>; this tab just carries the log.

import type { KeywordSpotterController } from "@/hooks/use-keyword-spotter";
import { LogCard } from "@/components/log-card";

export function KeywordSpotterPanel({
  kws,
}: {
  kws: KeywordSpotterController;
}) {
  return (
    <section className="flex w-full flex-col gap-4">
      <LogCard title="Log" entries={kws.logEntries} />
    </section>
  );
}
