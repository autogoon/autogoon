'use client';

// A picture she sent, inline in the transcript — left-aligned like her
// bubbles. A thumbnail; click it to open the full picture in the lightbox.

import Image from 'next/image';

export function PictureBubble({
  src,
  onOpen,
}: {
  src: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open picture"
        className="ring-foreground/10 relative h-44 w-44 overflow-hidden rounded-2xl ring-1 transition hover:opacity-90"
      >
        <Image src={src} alt="" fill sizes="176px" className="object-cover" />
      </button>
    </div>
  );
}
