"use client";

// The words the app is currently listening for — the global connect/start/stop
// plus the running algorithm's keywords — highlighting each as it's detected.
// This is exactly vosk's live grammar (see useKeywordSpotter.listeningFor).

import { Card } from "@/components/card";

export function ListeningFor({
  words,
  flashing,
}: {
  words: string[];
  flashing: ReadonlySet<string>;
}) {
  return (
    <Card title="Listening for">
      <div className="flex flex-wrap gap-2">
        {words.map((word) => (
          <span
            key={word}
            className={`rounded-md border px-2 py-1 font-mono text-sm transition-colors ${
              flashing.has(word)
                ? "border-foreground text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {word}
          </span>
        ))}
      </div>
    </Card>
  );
}
