// What the build says about the files a pack left behind. Which files those are
// is goonpack-build.ts's subtraction, and whether a file is media at all is
// parsePack's — and pack.test.ts's.
import { describe, it, expect } from '@jest/globals';
import { captionWarning } from './goonpack-report';

describe('captionWarning', () => {
  it('reports nothing when every media file carries a sidecar', () => {
    expect(captionWarning([])).toBeNull();
  });

  it('names the files with no sidecar, so the author knows which are left', () => {
    expect(captionWarning(['b.jpg'])).toContain('b.jpg');
  });

  it('counts every file with no sidecar while naming only the first few', () => {
    expect(captionWarning(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'])).toBe(
      '5 media files with no sidecar (a.jpg, b.jpg, c.jpg, …)',
    );
  });

  it('drops the plural and the ellipsis for a single file with no sidecar', () => {
    expect(captionWarning(['a.jpg'])).toBe(
      '1 media file with no sidecar (a.jpg)',
    );
  });
});
