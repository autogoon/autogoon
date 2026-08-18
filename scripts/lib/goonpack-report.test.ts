// What the build says about the two things parsePack accepts but an author
// probably didn't mean: media left out for want of a sidecar, and names under media/ that
// nothing will play. Which files fall into each is parsePack's — and
// pack.test.ts's.
import { describe, it, expect } from '@jest/globals';
import { captionWarning, strayWarning } from './goonpack-report';

describe('captionWarning', () => {
  it('reports nothing when every media file carries a sidecar', () => {
    expect(captionWarning([])).toBeNull();
  });

  it('names the files it left out, so the author knows which are missing a sidecar', () => {
    expect(captionWarning(['b.jpg'])).toContain('b.jpg');
  });

  it('counts every file left out while naming only the first few', () => {
    expect(captionWarning(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'])).toBe(
      '5 media files left out for want of a sidecar (a.jpg, b.jpg, c.jpg, …)',
    );
  });

  it('drops the plural and the ellipsis for a single file left out', () => {
    expect(captionWarning(['a.jpg'])).toBe(
      '1 media file left out for want of a sidecar (a.jpg)',
    );
  });
});

describe('strayWarning', () => {
  it('reports nothing when every basename under media/ has a media file', () => {
    expect(strayWarning([])).toBeNull();
  });

  it('counts every stray basename while naming only the first few', () => {
    expect(strayWarning(['a', 'b', 'c', 'd', 'e'])).toBe(
      "5 basenames which don't have a valid media kind (a, b, c, …)",
    );
  });

  it('reads as one for a single stray basename', () => {
    expect(strayWarning(['notes'])).toBe(
      "1 basename which doesn't have a valid media kind (notes)",
    );
  });
});
