// What a build takes out of a pack source. The source holds everything
// inference wrote as well as everything a pack carries, so what matters here is
// what is left behind.

import { describe, expect, it } from '@jest/globals';
import { packContents } from './pack-contents';

const BASELINE = '2026-08-02-baseline';

const SOURCE = [
  'manifest.json',
  'system-prompt.md',
  'media/beach.jpg',
  'media/beach.md',
  'media/beach.labels.json',
  `media/beach.${BASELINE}.fields.json`,
  `media/beach.${BASELINE}.prompt.txt`,
  `media/beach.${BASELINE}.raw.txt`,
  `media/beach.${BASELINE}.sidecar.md`,
  `media/beach.${BASELINE}.20260803143629.e4fadd882ce7.sidecar.md`,
];

const entries = (names: string[], experiment?: string): string[] =>
  packContents(names, experiment)
    .files.map((f) => f.entry)
    .sort();

describe('packContents', () => {
  it('ships the manifest, the prompt, and a described picture', () => {
    expect(entries(SOURCE)).toEqual([
      'manifest.json',
      'media/beach.jpg',
      'media/beach.md',
      'system-prompt.md',
    ]);
  });

  it("leaves behind everything an experiment wrote, including a run's own copies", () => {
    expect(entries(SOURCE)).not.toContain(`media/beach.${BASELINE}.raw.txt`);
    expect(entries(SOURCE)).not.toContain('media/beach.labels.json');
  });

  it('leaves out a picture nothing has described, since nothing could pick it', () => {
    expect(entries(['manifest.json', 'media/beach.jpg'])).toEqual([
      'manifest.json',
    ]);
  });

  it('reports the media it left out, which parsePack is never handed', () => {
    expect(
      packContents(['manifest.json', 'media/beach.jpg']).undescribed,
    ).toEqual(['beach.jpg']);
  });

  it('reports a name under media/ that belongs to nothing', () => {
    expect(packContents([...SOURCE, 'media/notes.txt']).strays).toEqual([
      'notes.txt',
    ]);
  });

  it("counts none of an experiment's files as strays", () => {
    expect(packContents(SOURCE).strays).toEqual([]);
  });

  it('reports a sidecar whose media was renamed away', () => {
    expect(packContents(['manifest.json', 'media/gone.md']).strays).toEqual([
      'gone.md',
    ]);
  });

  it('leaves macOS junk out of the strays, since nobody put it there', () => {
    expect(packContents([...SOURCE, 'media/.DS_Store']).strays).toEqual([]);
  });

  it("takes the named experiment's sidecar under the name a pack reads", () => {
    expect(packContents(SOURCE, BASELINE).files).toContainEqual({
      entry: 'media/beach.md',
      source: `media/beach.${BASELINE}.sidecar.md`,
    });
  });

  it('leaves out an item that experiment never described, rather than falling back to the stock one', () => {
    const source = ['manifest.json', 'media/beach.jpg', 'media/beach.md'];
    expect(entries(source, BASELINE)).toEqual(['manifest.json']);
  });

  it("does not mistake a run's archived copy for that experiment's sidecar", () => {
    const source = [
      'manifest.json',
      'media/beach.jpg',
      `media/beach.${BASELINE}.20260803143629.e4fadd882ce7.sidecar.md`,
    ];
    expect(entries(source, BASELINE)).toEqual(['manifest.json']);
  });

  it('keeps the dots in a stem that has them', () => {
    const source = [
      'manifest.json',
      'media/beach.holiday.jpg',
      `media/beach.holiday.${BASELINE}.sidecar.md`,
    ];
    expect(entries(source, BASELINE)).toEqual([
      'manifest.json',
      'media/beach.holiday.jpg',
      'media/beach.holiday.md',
    ]);
  });

  it('ships a video the same way it ships a picture', () => {
    const source = ['manifest.json', 'media/clip.mp4', 'media/clip.md'];
    expect(entries(source)).toEqual([
      'manifest.json',
      'media/clip.md',
      'media/clip.mp4',
    ]);
  });
});
