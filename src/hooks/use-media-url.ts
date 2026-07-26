'use client';
// A media entry's object URL, minted on first use. The entry memoises the URL
// on itself, so a re-render (or a second bubble showing the same item) is
// synchronous from then on — the null return is only ever the very first paint.

import { useEffect, useState } from 'react';
import type { CompanionMedia } from '@/lib/companions/companions';

export function useMediaUrl(media: CompanionMedia | null): string | null {
  const [src, setSrc] = useState<string | null>(media?.src ?? null);
  useEffect(() => {
    if (media === null) {
      setSrc(null);
      return;
    }
    if (media.src !== undefined) {
      setSrc(media.src);
      return;
    }
    let live = true;
    void media.load().then(
      (url) => {
        if (live) setSrc(url);
      },
      () => {
        // The file is gone from storage — render the placeholder rather than a
        // broken element.
        if (live) setSrc(null);
      },
    );
    return () => {
      live = false;
    };
  }, [media]);
  return src;
}
