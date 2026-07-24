import { describe, expect, it } from "@jest/globals";
import { parseChangelog } from "./changelog";

// The changelog's strict format (see CLAUDE.md): `## YYYY-MM-DD` day headings,
// one `- tag: text` line per change, inline `code` and [link](url) only.

const SAMPLE = `# Changelog

## 2026-07-16

- feature: **Add after-play outcomes** — Goon now asks what \`cumming\` should bring. ([#11](https://github.com/autogoon/autogoon/pull/11))
- bug: Something was broken.

## 2026-07-14

- enhancement: Nicer dips.
`;

describe("parseChangelog", () => {
  it("parses days in file order with their dates and entries", () => {
    const days = parseChangelog(SAMPLE);
    expect(days.map((d) => d.date)).toEqual(["2026-07-16", "2026-07-14"]);
    expect(days[0]!.entries).toHaveLength(2);
    expect(days[1]!.entries).toHaveLength(1);
  });

  it("splits the tag off each entry", () => {
    const days = parseChangelog(SAMPLE);
    expect(days[0]!.entries.map((e) => e.tag)).toEqual(["feature", "bug"]);
    expect(days[1]!.entries[0]!.tag).toBe("enhancement");
  });

  it("splits the bold few-word summary off an entry", () => {
    const days = parseChangelog(SAMPLE);
    expect(days[0]!.entries[0]!.summary).toBe("Add after-play outcomes");
    // Entries without one read as summary-less, not broken.
    expect(days[0]!.entries[1]!.summary).toBeNull();
    expect(days[0]!.entries[1]!.paragraphs).toEqual([
      [{ kind: "text", text: "Something was broken." }],
    ]);
  });

  it("parses inline code and links into segments", () => {
    const entry = parseChangelog(SAMPLE)[0]!.entries[0]!;
    // A sentence ending before "(" is not a paragraph break, so the PR link
    // stays attached to its sentence.
    expect(entry.paragraphs).toEqual([
      [
        { kind: "text", text: "Goon now asks what " },
        { kind: "code", text: "cumming" },
        { kind: "text", text: " should bring. (" },
        {
          kind: "link",
          text: "#11",
          href: "https://github.com/autogoon/autogoon/pull/11",
        },
        { kind: "text", text: ")" },
      ],
    ]);
  });

  it("splits an entry into paragraphs at sentence boundaries", () => {
    const days = parseChangelog(
      "## 2026-01-01\n\n- feature: First thing. Second thing with `code`. And a third.\n",
    );
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: "text", text: "First thing." }],
      [
        { kind: "text", text: "Second thing with " },
        { kind: "code", text: "code" },
        { kind: "text", text: "." },
      ],
      [{ kind: "text", text: "And a third." }],
    ]);
  });

  it("keeps an entry with no recognised tag whole, tagged null", () => {
    const days = parseChangelog("## 2026-01-01\n\n- just some text\n");
    expect(days[0]!.entries[0]!.tag).toBeNull();
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: "text", text: "just some text" }],
    ]);
  });

  it("joins a wrapped entry's continuation lines", () => {
    const days = parseChangelog(
      "## 2026-01-01\n\n- feature: **Long one** — starts here\n  and wraps here.\n- bug: Next entry.\n",
    );
    expect(days[0]!.entries).toHaveLength(2);
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: "text", text: "starts here and wraps here." }],
    ]);
  });

  it("allows blank lines between entries", () => {
    const days = parseChangelog(
      "## 2026-01-01\n\n- feature: One thing\n  wrapped.\n\n- bug: Another.\n",
    );
    expect(days[0]!.entries.map((e) => e.tag)).toEqual(["feature", "bug"]);
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: "text", text: "One thing wrapped." }],
    ]);
  });

  it("parses the empty string to no days", () => {
    expect(parseChangelog("")).toEqual([]);
  });
});
