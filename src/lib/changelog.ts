// Parses CHANGELOG.md's deliberately strict format (see CLAUDE.md) into data
// the Changelog screen renders: `## YYYY-MM-DD` day headings, one
// `- tag: text` line per change, and only `code` spans and [text](url) links
// inline. Pure — no React, no environment.

export type ChangeTag = "feature" | "enhancement" | "bug" | "internal";

export type InlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export interface ChangelogEntry {
  // null when the line carries no recognised `tag:` prefix.
  tag: ChangeTag | null;
  // The few-word, commit-style summary (`**Add safe word**` at the start of
  // the entry); null on entries written before the convention.
  summary: string | null;
  // The entry's text, split into paragraphs at sentence boundaries so long
  // entries don't render as one dense block. A boundary is a sentence ender
  // followed by whitespace and a capital — ". (" and mid-sentence code spans
  // don't split, so a trailing PR link stays with its sentence.
  paragraphs: InlineSegment[][];
}

export interface ChangelogDay {
  date: string;
  entries: ChangelogEntry[];
}

const TAGS: readonly ChangeTag[] = [
  "feature",
  "enhancement",
  "bug",
  "internal",
];

// One alternation per inline form; everything between matches is plain text.
const INLINE = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  for (const part of text.split(INLINE)) {
    if (part === "") continue;
    if (part.startsWith("`") && part.endsWith("`")) {
      segments.push({ kind: "code", text: part.slice(1, -1) });
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link !== null) {
      segments.push({ kind: "link", text: link[1]!, href: link[2]! });
      continue;
    }
    segments.push({ kind: "text", text: part });
  }
  return segments;
}

// Regroup an entry's segments into paragraphs, splitting text segments at
// sentence boundaries (see ChangelogEntry.paragraphs).
function splitParagraphs(segments: InlineSegment[]): InlineSegment[][] {
  const paragraphs: InlineSegment[][] = [[]];
  const push = (segment: InlineSegment) =>
    paragraphs[paragraphs.length - 1]!.push(segment);
  for (const segment of segments) {
    if (segment.kind !== "text") {
      push(segment);
      continue;
    }
    segment.text.split(/(?<=[.!?])\s+(?=[A-Z])/).forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part !== "") push({ kind: "text", text: part });
    });
  }
  return paragraphs.filter((p) => p.length > 0);
}

function parseEntry(line: string): ChangelogEntry {
  const tagged = /^(\w+): (.*)$/.exec(line);
  const tag =
    tagged !== null && (TAGS as readonly string[]).includes(tagged[1]!)
      ? (tagged[1] as ChangeTag)
      : null;
  let rest = tag === null ? line : tagged![2]!;
  // The leading bold run is the summary; the ` — ` joining it to the
  // description is formatting, not content.
  const titled = /^\*\*([^*]+)\*\*(?: — )?(.*)$/.exec(rest);
  const summary = titled?.[1] ?? null;
  if (titled !== null) rest = titled[2]!;
  return {
    tag,
    summary,
    paragraphs: splitParagraphs(parseInline(rest)),
  };
}

export function parseChangelog(markdown: string): ChangelogDay[] {
  const days: ChangelogDay[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^## (.+)$/.exec(line);
    if (heading !== null) {
      days.push({ date: heading[1]!, entries: [] });
      continue;
    }
    const bullet = /^- (.*)$/.exec(line);
    const day = days[days.length - 1];
    if (bullet !== null && day !== undefined) {
      day.entries.push(parseEntry(bullet[1]!));
    }
    // Anything else (the H1, blank lines) is structure, not content.
  }
  return days;
}
