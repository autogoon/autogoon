'use client';
// A media entry's object URL, minted on first use. The entry memoises the URL
// on itself, so a re-render — or a second bubble showing the same item — is
// ready on its first paint; only the very first use of a file is `loading`.
// `missing` means the file is not in the loaded set (or has gone from storage):
// the caller renders a placeholder, never a substitute.

import { useEffect, useState } from 'react';
import type { CompanionMedia } from '@/lib/companions/companions';

export type MediaUrl =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'missing' };

export function useMediaUrl(media: CompanionMedia | null): MediaUrl {
  const [state, setState] = useState<MediaUrl>(() =>
    media === null
      ? { status: 'missing' }
      : media.src !== undefined
        ? { status: 'ready', src: media.src }
        : { status: 'loading' },
  );
  useEffect(() => {
    if (media === null) {
      setState({ status: 'missing' });
      return;
    }
    if (media.src !== undefined) {
      setState({ status: 'ready', src: media.src });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    void media.load().then(
      (src) => {
        if (live) setState({ status: 'ready', src });
      },
      () => {
        if (live) setState({ status: 'missing' });
      },
    );
    return () => {
      live = false;
    };
  }, [media]);
  return state;
}
