import { describe, expect, it } from '@jest/globals';
import { parsePasses, selectFiles } from './sweep-files';

describe('selectFiles', () => {
  it('drops persona prompts, CHECK-QUESTIONS.md and the sweep briefs', () => {
    expect(
      selectFiles([
        'README.md',
        'goonpacks/elise/system-prompt.md',
        'CHECK-QUESTIONS.md',
        'scripts/md-sweep-briefs/doc.md',
      ]),
    ).toEqual(['README.md']);
  });

  it('orders root docs first, then modes, roadmap, docs and skills', () => {
    expect(
      selectFiles([
        '.claude/skills/doc-check/SKILL.md',
        'docs/2026-08-05-plan.md',
        'roadmap/THEMING.md',
        'modes/GOON.md',
        'README.md',
      ]),
    ).toEqual([
      'README.md',
      'modes/GOON.md',
      'roadmap/THEMING.md',
      'docs/2026-08-05-plan.md',
      '.claude/skills/doc-check/SKILL.md',
    ]);
  });

  it('puts a file in no named directory last', () => {
    expect(selectFiles(['src/inference/x/README.md', 'modes/GOON.md'])).toEqual(
      ['modes/GOON.md', 'src/inference/x/README.md'],
    );
  });

  it('sorts alphabetically within one rank', () => {
    expect(selectFiles(['modes/GROOVE.md', 'modes/AUTOPILOT.md'])).toEqual([
      'modes/AUTOPILOT.md',
      'modes/GROOVE.md',
    ]);
  });

  it('sweeps a named file the enumeration would have excluded', () => {
    expect(
      selectFiles(['README.md'], ['scripts/md-sweep-briefs/doc.md']),
    ).toEqual(['scripts/md-sweep-briefs/doc.md']);
  });

  it('leaves the list it was given unsorted', () => {
    const only = ['modes/GOON.md', 'README.md'];
    selectFiles([], only);
    expect(only).toEqual(['modes/GOON.md', 'README.md']);
  });
});

describe('parsePasses', () => {
  it('runs all four passes in order when none is named', () => {
    expect(parsePasses()).toEqual(['doc', 'style', 'register', 'duplication']);
  });

  it('runs the named passes in the order given', () => {
    expect(parsePasses('style,doc')).toEqual(['style', 'doc']);
  });

  it('throws naming the pass it does not recognise', () => {
    expect(() => parsePasses('doc,speling')).toThrow(/speling/);
  });
});
