// What the build says about a pack it built anyway. Whether an uncaptioned file
// is valid at all is parsePack's, and pack.test.ts's.
import { describe, it, expect } from '@jest/globals';
import type { ParsedMedia } from '../../src/lib/goonpacks/pack';
import { captionWarning } from './goonpack-report';

const item = (file: string, description: string): ParsedMedia => ({
  name: file.slice(0, file.lastIndexOf('.')),
  file,
  kind: 'image',
  mimeType: 'image/jpeg',
  description,
});

describe('captionWarning', () => {
  it('reports nothing when every media file carries a caption', () => {
    expect(
      captionWarning([item('a.jpg', 'a beach'), item('b.jpg', 'a kitchen')]),
    ).toBeNull();
  });

  it('reports nothing for a pack carrying no media at all', () => {
    expect(captionWarning([])).toBeNull();
  });

  it('names the files with no caption, so the author knows which are left', () => {
    expect(
      captionWarning([item('a.jpg', 'a beach'), item('b.jpg', '')]),
    ).toContain('b.jpg');
  });

  it('counts every uncaptioned file while naming only the first few', () => {
    const media = ['a', 'b', 'c', 'd', 'e'].map((n) => item(`${n}.jpg`, ''));
    expect(captionWarning(media)).toBe(
      '5 media files with no caption (a.jpg, b.jpg, c.jpg, …)',
    );
  });

  it('drops the plural and the ellipsis for a single uncaptioned file', () => {
    expect(captionWarning([item('a.jpg', '')])).toBe(
      '1 media file with no caption (a.jpg)',
    );
  });
});
