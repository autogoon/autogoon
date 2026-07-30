/**
 * @jest-environment jsdom
 */
// What a bubble is told to render for one media entry, and that an entry whose
// URL was revoked underneath it goes back to disk instead of staying pointed at
// a dead URL. Which entries get revoked is
// library.test.ts's (carryMediaOver).
import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CompanionMedia } from '@/lib/companions/companions';
import { useMediaUrl } from './use-media-url';

// A media entry with the memo the real one carries: load() resolves to a URL
// and remembers it on `src`, forget() drops both. `open` is what the file read
// is standing in for, so a test can make it fail.
function entry(
  open: () => Promise<string> = () => Promise.resolve('blob:one'),
): CompanionMedia {
  const media: CompanionMedia = {
    kind: 'image',
    caption: 'a still',
    description: 'a still, described at length',
    ref: 'goonpack:pub.pack@1.0.0/one',
    load: () =>
      open().then((url) => {
        media.src = url;
        return url;
      }),
    forget: () => {
      media.src = undefined;
    },
  };
  return media;
}

describe('useMediaUrl', () => {
  it('reads a file it has never opened, reporting loading until the URL lands', async () => {
    const media = entry();
    const { result } = renderHook(() => useMediaUrl(media));
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'ready', src: 'blob:one' }),
    );
  });

  it('paints an entry that already carries a URL ready on its first render', () => {
    const media = entry();
    media.src = 'blob:already';
    const load = jest.spyOn(media, 'load');
    const { result } = renderHook(() => useMediaUrl(media));
    expect(result.current).toEqual({ status: 'ready', src: 'blob:already' });
    expect(load).not.toHaveBeenCalled();
  });

  it('reports missing for an entry whose file will not open', async () => {
    const media = entry(() => Promise.reject(new Error('gone')));
    const { result } = renderHook(() => useMediaUrl(media));
    await waitFor(() => expect(result.current).toEqual({ status: 'missing' }));
  });

  it('reports missing for a thread ref that resolved to no entry at all', () => {
    const { result } = renderHook(() => useMediaUrl(null));
    expect(result.current).toEqual({ status: 'missing' });
  });

  // carryMediaOver revokes a removed pack's URLs and calls forget(), without
  // replacing the entry objects a Companion resolved earlier is holding. The
  // entry's identity is therefore unchanged, and only the `media.src`
  // dependency makes this render again — without it the bubble stays on screen
  // showing a URL the browser has already released.
  it('re-reads an entry whose URL was revoked and forgotten underneath it', async () => {
    let url = 'blob:one';
    const media = entry(() => Promise.resolve(url));
    const { result, rerender } = renderHook(() => useMediaUrl(media));
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'ready', src: 'blob:one' }),
    );

    url = 'blob:reopened';
    act(() => media.forget());
    rerender();
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'ready', src: 'blob:reopened' }),
    );
  });
});
