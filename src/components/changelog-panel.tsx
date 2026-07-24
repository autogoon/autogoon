"use client";

// The Changelog screen: renders CHANGELOG.md, which next.config.ts freezes
// into the bundle at build time. One card per day, each change on its own
// line with a coloured tag pill; `code` spans wear the voice-badge look and
// PR links open on GitHub.

import { Card } from "@/components/card";
import {
  parseChangelog,
  type ChangeTag,
  type InlineSegment,
} from "@/lib/changelog";

const DAYS = parseChangelog(process.env.NEXT_PUBLIC_CHANGELOG ?? "");

// Solid pills, white-lettered, the same deep fills in both themes.
const TAG_CLASS: Record<ChangeTag, string> = {
  feature: "bg-emerald-800",
  enhancement: "bg-blue-800",
  bug: "bg-red-800",
  internal: "bg-zinc-700",
};

function Inline({ segment }: { segment: InlineSegment }) {
  if (segment.kind === "code") {
    return (
      <span className="bg-background text-muted-foreground rounded border px-1 py-0.5 font-mono text-sm leading-none">
        {segment.text}
      </span>
    );
  }
  if (segment.kind === "link") {
    return (
      <a
        href={segment.href}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground underline underline-offset-4"
      >
        {segment.text}
      </a>
    );
  }
  return <>{segment.text}</>;
}

export function ChangelogPanel() {
  return (
    <section className="flex w-full flex-col gap-8">
      {DAYS.map((day) => (
        <Card key={day.date}>
          {/* A larger heading than Card's own — the dates are the changelog's
              top-level structure. */}
          <h2 className="text-foreground text-2xl font-semibold">{day.date}</h2>
          <ul className="flex flex-col gap-6">
            {day.entries.map((entry, i) => (
              <li key={i} className="space-y-2">
                {/* Pill + the few-word bold summary on the first line, the
                    full description as muted paragraphs below. */}
                {entry.summary !== null && (
                  <p>
                    {entry.tag !== null && (
                      <span
                        className={`text-foreground mr-2 rounded-full px-3 py-1 font-semibold tracking-wide whitespace-nowrap ${TAG_CLASS[entry.tag]}`}
                      >
                        {entry.tag}
                      </span>
                    )}
                    <span className="text-foreground font-semibold">
                      {entry.summary}
                    </span>
                  </p>
                )}

                {entry.paragraphs.map((paragraph, j) => (
                  <p key={j}>
                    {paragraph.map((segment, k) => (
                      <Inline key={k} segment={segment} />
                    ))}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  );
}
