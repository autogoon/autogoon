// A media entry's object URL, minted on first use. The entry memoises the URL
// on itself, so a re-render — or a second bubble showing the same item — is
// ready on its first paint; only the very first use of a file is `loading`.
// `missing` means the file is not in the loaded set (or has gone from storage):
// the caller renders a placeholder, never a substitute. A pack removed while its
// media is on screen lands here too — the entry loses its URL and the file it
// would re-read has gone with the pack.

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
    const memoised = media.src;
    if (memoised !== undefined) {
      // Adopt the entry's URL, and hold the state object when it is the one
      // already on screen — the URL landing is itself a render, which runs this
      // again.
      setState((s) =>
        s.status === 'ready' && s.src === memoised
          ? s
          : { status: 'ready', src: memoised },
      );
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
    // `media.src` as well as the entry: removing a pack revokes its URLs and
    // forgets them (library.ts, carryMediaOver) without replacing the entry
    // objects a resolved Companion holds, so the entry's identity alone would
    // leave a bubble already on screen pointing at a revoked URL.
  }, [media, media?.src]);
  return state;
}
