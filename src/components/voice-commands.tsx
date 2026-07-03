"use client";

// Shows which spoken words this algorithm responds to. Presentation only — the
// words come from the algorithm's keyword map (plus the universal start/stop).

import { Card } from "@/components/card";

export function VoiceCommands({ words }: { words: string[] }) {
  if (words.length === 0) return null;
  return (
    <Card title="Voice commands">
      <div className="flex flex-wrap gap-2">
        {words.map((word) => (
          <span
            key={word}
            className="text-muted-foreground rounded-md border px-2 py-1 font-mono text-sm"
          >
            {word}
          </span>
        ))}
      </div>
    </Card>
  );
}
