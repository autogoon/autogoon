'use client';

// Something the companion sent, inline in the transcript — left-aligned like
// their bubbles. A still is a thumbnail; a video plays inline, muted and
// looping, as its own preview. Either one opens full-size in the lightbox on
// click.

import Image from 'next/image';
import type { CompanionMedia } from '@/lib/companions/companions';
import { useMediaUrl } from '@/hooks/use-media-url';
import { MissingMediaBubble } from './missing-media-bubble';

export function MediaBubble({
  media,
  onOpen,
}: {
  media: CompanionMedia;
  onOpen: () => void;
}) {
  const src = useMediaUrl(media);
  if (src === null) return <MissingMediaBubble />;
  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={onOpen}
        aria-label={media.kind === 'video' ? 'Open video' : 'Open picture'}
        className="ring-foreground/10 relative h-44 w-44 overflow-hidden rounded-2xl ring-1 transition hover:opacity-90"
      >
        {media.kind === 'video' ? (
          <video
            src={src}
            muted
            loop
            autoPlay
            playsInline
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <Image src={src} alt="" fill sizes="176px" className="object-cover" />
        )}
      </button>
    </div>
  );
}
