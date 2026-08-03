// Near-fullscreen overlay showing the Debug tab's LLM request JSON. The
// Lightbox's shell (backdrop, ✕, Escape) without its enter/exit animation, plus
// a copy button — the request is read by pasting it somewhere else.

import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

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

  // What the last copy did. Said rather than assumed: the clipboard write needs
  // a permission and a secure context, and a button that looks identical
  // whether or not the JSON is on the clipboard is worse than no button when
  // the next step is pasting it somewhere.
  const [copied, setCopied] = useState<'no' | 'yes' | 'failed'>('no');
  useEffect(() => {
    if (copied === 'no') return;
    const id = setTimeout(() => setCopied('no'), 2000);
    return () => clearTimeout(id);
  }, [copied]);
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
      {/* stopPropagation so clicking the copy button or selecting the JSON
          doesn't close it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[92vw] max-w-3xl flex-col gap-2"
      >
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(json).then(
              () => setCopied('yes'),
              () => setCopied('failed'),
            );
          }}
          aria-label="Copy to clipboard"
          title="Copy to clipboard"
          className="flex items-center gap-2 self-start rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
        >
          {copied === 'yes' ? (
            <Check className="size-4" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied === 'yes'
            ? 'Copied'
            : copied === 'failed'
              ? "Couldn't copy"
              : 'Copy'}
        </button>
        <pre className="bg-background max-h-[80vh] overflow-auto rounded-xl p-4 text-xs whitespace-pre-wrap">
          {json}
        </pre>
      </div>
    </div>
  );
}
