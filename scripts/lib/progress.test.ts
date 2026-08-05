// The build's one-line counter. What it has to get right is that it never
// leaves the terminal in a state the next line has to fight — a redraw shorter
// than the last must not leave the last one's tail behind, and clearing must
// leave the cursor on a blank line.

import { describe, it, expect } from '@jest/globals';
import { progress, type Writer } from './progress';

const collector = (): Writer & { written: string[] } => {
  const written: string[] = [];
  return { written, write: (text) => void written.push(text) };
};

describe('progress', () => {
  it('draws the pass, the count and the total', () => {
    const out = collector();
    progress(out).step('zipping', 3, 3);
    expect(out.written[0]).toContain('zipping 3/3');
  });

  it('draws the first of a pass, so a slow one shows before its first file is done', () => {
    const out = collector();
    progress(out).step('zipping', 1, 3635);
    expect(out.written[0]).toContain('zipping 1/3635');
  });

  it('pads a shorter line to the widest drawn, so no tail is left behind', () => {
    const out = collector();
    const p = progress(out);
    p.step('reading sidecars', 1000, 1000);
    p.step('zipping', 1, 1);
    const [long, short] = out.written;
    expect(short).toHaveLength(long!.length);
  });

  it('leaves the line blank and the cursor at its start', () => {
    const out = collector();
    const p = progress(out);
    p.step('zipping', 1, 1);
    p.clear();
    expect(out.written[1]).toMatch(/^\r +\r$/);
  });

  it('draws nothing for a pass with nothing in it', () => {
    const out = collector();
    progress(out).step('zipping', 0, 0);
    expect(out.written).toEqual([]);
  });
});
