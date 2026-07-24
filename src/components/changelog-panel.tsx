"use client";

// The Changelog screen: renders CHANGELOG.md, which next.config.ts freezes
// into the bundle at build time. One card per day, each change on its own
// line with a coloured tag pill; `code` spans wear the voice-badge look and
// PR links open on GitHub.

import { Card } from "@/components/card";
import { Panel } from "@/components/panel";
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
    <Panel>
      {DAYS.map((day) => (
        <Card key={day.date} title={day.date}>
          {day.entries.map((entry, i) => (
            /* One card per change: tag pill then summary as the title, the
               description as the body. */
            <Card
              key={i}
              className="mb-4"
              title={
                entry.summary !== null || entry.tag !== null ? (
                  <>
                    {entry.tag !== null && (
                      // text-base: the pill keeps its own size against the
                      // title's larger type.
                      <span
                        className={`text-foreground mr-2 rounded-full px-3 py-1 text-base font-semibold tracking-wide whitespace-nowrap ${TAG_CLASS[entry.tag]}`}
                      >
                        {entry.tag}
                      </span>
                    )}
                    {entry.summary}
                  </>
                ) : undefined
              }
            >
              {entry.paragraphs.map((paragraph, j) => (
                <p key={j}>
                  {paragraph.map((segment, k) => (
                    <Inline key={k} segment={segment} />
                  ))}
                </p>
              ))}
            </Card>
          ))}
        </Card>
      ))}
    </Panel>
  );
}
