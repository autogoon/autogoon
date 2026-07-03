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
      <Card title="Word list">
        <div className="flex gap-2">
          <input
            type="text"
            value={kws.wordsText}
            onChange={(e) => kws.setWordsText(e.target.value)}
            spellCheck={false}
            className="bg-background text-foreground flex-1 rounded-lg border px-3 py-2"
          />
          <button
            onClick={kws.applyWords}
            className="bg-background rounded-lg border px-4 py-2"
          >
            Apply
          </button>
        </div>
        <p className="text-muted-foreground text-sm">
          Space-separated. Alternate spellings of one keyword can be grouped
          with <code>/</code>, e.g. <code>woah/whoa</code>. Words must exist in
          the model&apos;s vocabulary.
        </p>
      </Card>

      <LogCard title="Log" entries={kws.logEntries} />
    </section>
  );
}
