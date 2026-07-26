import { describe, expect, it } from '@jest/globals';
import { MEDIA_TYPES, isJunkPath, splitName } from './media';

describe('MEDIA_TYPES', () => {
  it('maps stills and videos to their kind and MIME type', () => {
    expect(MEDIA_TYPES.jpg).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    expect(MEDIA_TYPES.jpeg).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    expect(MEDIA_TYPES.png).toEqual({ kind: 'image', mimeType: 'image/png' });
    expect(MEDIA_TYPES.webp).toEqual({ kind: 'image', mimeType: 'image/webp' });
    expect(MEDIA_TYPES.mp4).toEqual({ kind: 'video', mimeType: 'video/mp4' });
    expect(MEDIA_TYPES.webm).toEqual({ kind: 'video', mimeType: 'video/webm' });
  });
  it('does not carry .mov — it is rejected by name, not accepted here', () => {
    expect(MEDIA_TYPES.mov).toBeUndefined();
  });
});

describe('splitName', () => {
  it('splits stem from a lowercased extension', () => {
    expect(splitName('Beach.JPG')).toEqual({ stem: 'Beach', ext: 'jpg' });
    expect(splitName('a.b.mp4')).toEqual({ stem: 'a.b', ext: 'mp4' });
    expect(splitName('noext')).toEqual({ stem: 'noext', ext: '' });
  });
});

describe('isJunkPath', () => {
  it('spots macOS and archive housekeeping', () => {
    expect(isJunkPath('__MACOSX/._manifest.json')).toBe(true);
    expect(isJunkPath('.DS_Store')).toBe(true);
    expect(isJunkPath('media/.DS_Store')).toBe(true);
    expect(isJunkPath('media/._beach.jpg')).toBe(true); // AppleDouble fork
    expect(isJunkPath('media/')).toBe(true); // directory entry
    expect(isJunkPath('media/beach.jpg')).toBe(false);
    expect(isJunkPath('manifest.json')).toBe(false);
  });
});
