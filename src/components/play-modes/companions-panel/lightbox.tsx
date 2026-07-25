'use client';

// Near-fullscreen overlay for a sent picture. The backdrop or the ✕ closes it,
// as does Escape. It's rendered with the current lightbox src, so sending a new
// picture while it's open simply swaps the image to the newest. Closing plays an
// exit fade-zoom before unmounting: requestClose flips to `closing` (swapping the
// enter animation for the exit one) and unmounts after the animation.

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import type { VoiceStage } from '@/lib/voice/session-policy';
import { VoiceStageBadge } from './voice-stage';

// How long the enter/exit fade-zoom runs — kept in sync with the `duration-200`
// classes below so the unmount waits for the exit animation to finish.
const LIGHTBOX_ANIM_MS = 200;

export function Lightbox({
  src,
  stage,
  onClose,
}: {
  src: string;
  // What the voice session is doing right now — the top-left badge. "idle"
  // renders no badge.
  stage: VoiceStage;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    setClosing(true);
    timerRef.current = window.setTimeout(onClose, LIGHTBOX_ANIM_MS);
  }, [onClose]);

  // A newly-sent picture reopens the box even mid-close: cancel the pending
  // unmount and clear the closing state so it animates back in on the new src.
  useEffect(() => {
    setClosing(false);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [src]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={requestClose}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 duration-200 ${
        closing ? 'animate-out fade-out-0' : 'animate-in fade-in-0'
      }`}
    >
      <VoiceStageBadge stage={stage} />
      <button
        type="button"
        onClick={requestClose}
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="size-6" />
      </button>
      {/* stopPropagation so clicking the image itself doesn't close it. */}
      <div
        className={`relative h-[88vh] w-[92vw] duration-200 ease-out ${
          closing
            ? 'animate-out fade-out-0 zoom-out-95'
            : 'animate-in fade-in-0 zoom-in-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt=""
          fill
          sizes="92vw"
          priority
          className="object-contain"
        />
      </div>
    </div>
  );
}
