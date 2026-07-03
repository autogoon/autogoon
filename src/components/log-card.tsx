"use client";

// A Card wrapping a scrolling, monospace log. Auto-scrolls to the newest
// entry. The algorithm panels use this for their command log (device sends,
// voice hits and final transcripts); the entry `kind` picks the line colour.

import { useEffect, useRef } from "react";
import { Card } from "@/components/card";

export interface LogEntry {
  id: number;
  time: string;
  text: string;
  kind: string;
}

const KIND_CLASS: Record<string, string> = {
  hit: "text-emerald-500",
  send: "text-foreground",
  error: "text-destructive",
};

export function LogCard({
  title,
  entries,
  className,
}: {
  title: string;
  entries: readonly LogEntry[];
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [entries]);

  return (
    <Card title={title} className={className}>
      <div
        ref={boxRef}
        className="text-muted-foreground h-64 overflow-y-auto font-mono text-xs"
      >
        {entries.map((entry) => (
          <div key={entry.id} className={KIND_CLASS[entry.kind]}>
            {entry.time} {entry.text}
          </div>
        ))}
      </div>
    </Card>
  );
}
