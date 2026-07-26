import { describe, expect, it } from '@jest/globals';
import { parseChangelog } from './changelog';

// SAMPLE is a miniature CHANGELOG.md in the shape CLAUDE.md mandates: all four
// tags, a bold summary, an entry with a trailing PR link. A day heading's text
// is taken as written, so nothing here pins the date's format.

const SAMPLE = `# Changelog

## 2026-07-16

- feature: **Add after-play outcomes** — Goon now asks what \`cumming\` should bring. ([#11](https://github.com/autogoon/autogoon/pull/11))
- bug: Something was broken.

## 2026-07-14

- enhancement: Nicer dips.
- internal: Engine helpers moved.
`;

describe('parseChangelog', () => {
  it('parses days in file order with their dates and entries', () => {
    const days = parseChangelog(SAMPLE);
    expect(days.map((d) => d.date)).toEqual(['2026-07-16', '2026-07-14']);
    expect(days[0]!.entries).toHaveLength(2);
    expect(days[1]!.entries).toHaveLength(2);
  });

  it('splits the tag off each entry', () => {
    const days = parseChangelog(SAMPLE);
    expect(days[0]!.entries.map((e) => e.tag)).toEqual(['feature', 'bug']);
    expect(days[1]!.entries.map((e) => e.tag)).toEqual([
      'enhancement',
      'internal',
    ]);
  });

  it('splits the bold few-word summary off an entry', () => {
    const days = parseChangelog(SAMPLE);
    expect(days[0]!.entries[0]!.summary).toBe('Add after-play outcomes');
  });

  it('reads an entry with no bold summary as summary-less', () => {
    const days = parseChangelog(SAMPLE);
    // Entries without one read as summary-less, not broken.
    expect(days[0]!.entries[1]!.summary).toBeNull();
    expect(days[0]!.entries[1]!.paragraphs).toEqual([
      [{ kind: 'text', text: 'Something was broken.' }],
    ]);
  });

  it('reads a bold summary that carries no description after it', () => {
    const days = parseChangelog(
      '## 2026-01-01\n\n- feature: **Bumped vosk**\n',
    );
    expect(days[0]!.entries[0]!.summary).toBe('Bumped vosk');
    expect(days[0]!.entries[0]!.paragraphs).toEqual([]);
  });

  it('parses inline code and links into segments', () => {
    const days = parseChangelog(
      '## 2026-01-01\n\n- feature: Uses `noPictures` and links [#11](https://github.com/autogoon/autogoon/pull/11)\n',
    );
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [
        { kind: 'text', text: 'Uses ' },
        { kind: 'code', text: 'noPictures' },
        { kind: 'text', text: ' and links ' },
        {
          kind: 'link',
          text: '#11',
          href: 'https://github.com/autogoon/autogoon/pull/11',
        },
      ],
    ]);
  });

  it('keeps a trailing PR link in the same paragraph as its sentence', () => {
    const entry = parseChangelog(SAMPLE)[0]!.entries[0]!;
    // A sentence ending before "(" is not a paragraph break.
    expect(entry.paragraphs).toHaveLength(1);
  });

  it('splits an entry into paragraphs at sentence boundaries', () => {
    const days = parseChangelog(
      '## 2026-01-01\n\n- feature: First thing. Second thing with `code`. And a third.\n',
    );
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: 'text', text: 'First thing.' }],
      [
        { kind: 'text', text: 'Second thing with ' },
        { kind: 'code', text: 'code' },
        { kind: 'text', text: '.' },
      ],
      [{ kind: 'text', text: 'And a third.' }],
    ]);
  });

  it('keeps an untagged entry whole, tagged null', () => {
    const days = parseChangelog('## 2026-01-01\n\n- just some text\n');
    expect(days[0]!.entries[0]!.tag).toBeNull();
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: 'text', text: 'just some text' }],
    ]);
  });

  it('keeps an entry with an unrecognised tag whole, tagged null', () => {
    const days = parseChangelog('## 2026-01-01\n\n- chore: tidied up\n');
    expect(days[0]!.entries[0]!.tag).toBeNull();
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: 'text', text: 'chore: tidied up' }],
    ]);
  });

  it("joins a wrapped entry's continuation lines", () => {
    const days = parseChangelog(
      '## 2026-01-01\n\n- feature: **Long one** — starts here\n  and wraps here.\n- bug: Next entry.\n',
    );
    expect(days[0]!.entries).toHaveLength(2);
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: 'text', text: 'starts here and wraps here.' }],
    ]);
  });

  it('allows blank lines between entries', () => {
    const days = parseChangelog(
      '## 2026-01-01\n\n- feature: One thing\n  wrapped.\n\n- bug: Another.\n',
    );
    expect(days[0]!.entries.map((e) => e.tag)).toEqual(['feature', 'bug']);
    expect(days[0]!.entries[0]!.paragraphs).toEqual([
      [{ kind: 'text', text: 'One thing wrapped.' }],
    ]);
  });

  it('parses the empty string to no days', () => {
    expect(parseChangelog('')).toEqual([]);
  });
});
