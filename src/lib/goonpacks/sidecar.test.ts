import { describe, expect, it } from '@jest/globals';
import { parseSidecar, renderSidecar, SidecarError } from './sidecar';

// A whole sidecar as it sits on disk, so the body's blank line is part of what
// the parse is read against rather than something the test joined together.
const file = `---
caption: A woman on a beach at sunset.
---

She stands at the waterline, facing away.

Behind her the sun is low.
`;

describe('parseSidecar', () => {
  it('reads the caption from the frontmatter and the description from the body', () => {
    const s = parseSidecar(file);
    expect(s.caption).toBe('A woman on a beach at sunset.');
    expect(s.description).toBe(
      'She stands at the waterline, facing away.\n\nBehind her the sun is low.',
    );
  });

  it('keeps a body that contains a horizontal rule intact', () => {
    const s = parseSidecar(
      `---\ncaption: One.\n---\n\nBefore.\n\n---\n\nAfter.\n`,
    );
    expect(s.description).toBe('Before.\n\n---\n\nAfter.');
  });

  it('keeps a key it has never heard of, since the question set is not its own', () => {
    const s = parseSidecar(
      `---\ncaption: One.\nnaked: true\nbreastSize: medium\n---\n\nBody.\n`,
    );
    expect(s.values).toEqual({ naked: true, breastSize: 'medium' });
  });

  it('refuses a mistyped caption, which is the key that has to be there', () => {
    expect(() => parseSidecar(`---\ncapton: One.\n---\n\nBody.\n`)).toThrow(
      /caption/,
    );
  });

  it('refuses a value that is a list rather than a word', () => {
    expect(() =>
      parseSidecar(`---\ncaption: One.\nexposed:\n  - back\n---\n\nBody.\n`),
    ).toThrow(/exposed/);
  });

  it('refuses a sidecar that is a bare line of text with no frontmatter', () => {
    expect(() => parseSidecar('Just a caption line.\n')).toThrow(SidecarError);
  });

  it('refuses a sidecar whose caption is missing or empty', () => {
    expect(() => parseSidecar(`---\ncaption: ''\n---\n\nBody.\n`)).toThrow(
      /caption/,
    );
    // `{}` rather than nothing between the fences: empty frontmatter parses to
    // null and is refused for not being a set of fields at all, which is a
    // different rule from the one this pins.
    expect(() => parseSidecar(`---\n{}\n---\n\nBody.\n`)).toThrow(/caption/);
  });

  it('refuses a sidecar with no body under the frontmatter', () => {
    expect(() => parseSidecar(`---\ncaption: One.\n---\n`)).toThrow(
      /description/,
    );
  });
});

describe('renderSidecar', () => {
  it('round-trips a sidecar through parseSidecar unchanged', () => {
    const s = {
      caption: 'A caption: with a colon.',
      description: 'A body.',
      values: {},
    };
    expect(parseSidecar(renderSidecar(s))).toEqual(s);
  });

  it('round-trips a description containing a horizontal rule', () => {
    const s = {
      caption: 'One.',
      description: 'Before.\n\n---\n\nAfter.',
      values: {},
    };
    expect(parseSidecar(renderSidecar(s))).toEqual(s);
  });

  it('round-trips the values a sidecar carries, whatever they are called', () => {
    const s = {
      caption: 'One.',
      description: 'A body.',
      values: { naked: true, breastSize: 'medium', imageText: 'HOTEL' },
    };
    expect(parseSidecar(renderSidecar(s))).toEqual(s);
  });
});
