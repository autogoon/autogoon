'use client';

// Near-fullscreen overlay showing the Debug tab's LLM request JSON. The
// Lightbox's shell (backdrop, ✕, Escape) without the animation machinery — a
// debug view doesn't need the polish.

import { useEffect } from 'react';
import { X } from 'lucide-react';

export function JsonOverlay({
  json,
  onClose,
}: {
  json: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="size-6" />
      </button>
      {/* stopPropagation so clicking/selecting the JSON doesn't close it. */}
      <pre
        onClick={(e) => e.stopPropagation()}
        className="bg-background max-h-[88vh] w-[92vw] max-w-3xl overflow-auto rounded-xl p-4 text-xs whitespace-pre-wrap"
      >
        {json}
      </pre>
    </div>
  );
}
