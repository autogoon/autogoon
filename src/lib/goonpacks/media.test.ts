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
  });
  it('returns the whole name as the stem when there is no extension', () => {
    expect(splitName('noext')).toEqual({ stem: 'noext', ext: '' });
  });
  it('keeps a leading dot as part of the stem, not an extension', () => {
    expect(splitName('.DS_Store')).toEqual({ stem: '.DS_Store', ext: '' });
  });
});

describe('isJunkPath', () => {
  it('treats __MACOSX entries, .DS_Store and AppleDouble forks as junk', () => {
    expect(isJunkPath('__MACOSX/media/beach.jpg')).toBe(true);
    expect(isJunkPath('__MACOSX/._manifest.json')).toBe(true);
    expect(isJunkPath('.DS_Store')).toBe(true);
    expect(isJunkPath('media/.DS_Store')).toBe(true);
    expect(isJunkPath('media/._beach.jpg')).toBe(true);
  });
  it('treats a bare directory entry as junk', () => {
    expect(isJunkPath('media/')).toBe(true);
  });
  it('keeps a media file and manifest.json', () => {
    expect(isJunkPath('media/beach.jpg')).toBe(false);
    expect(isJunkPath('manifest.json')).toBe(false);
  });
});
