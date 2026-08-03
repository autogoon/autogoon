// The review modal: one corpus item filling the screen, with the controls that
// answer it — the picture beside the fields, the navigation, and the selected
// experiment's reply.
//
// The keys are bound here rather than on the screen behind it, so an option key
// answers only while there is an item to answer. Escape and the ✕ close it; the
// backdrop does not, because the modal covers the screen and a click landing
// outside the picture is a slip rather than an intention.

import { useCallback, useEffect } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FIELDS } from './fields';
import { HUMAN } from './labels';
import { mediaUrl, type SurveyedItem } from './item';
import type { CorpusView } from './use-corpus';

// Where a keystroke means something else entirely.
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

export function Review({
  corpus,
  // The item on screen, passed separately from the view: the screen opens this
  // only over an item that exists, and saying so here keeps the null out.
  item,
  onClose,
}: {
  corpus: CorpusView;
  item: SurveyedItem;
  onClose: () => void;
}) {
  const { answer, generate, step, nextUnanswered } = corpus;

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && TYPING.test(target.tagName)) return;
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'u') {
        nextUnanswered();
        return;
      }
      if (key === 'g') {
        generate();
        return;
      }
      for (const field of FIELDS) {
        const option = field.options.find((o) => o.key === key);
        if (option !== undefined) {
          answer(field.id, option.value);
          return;
        }
      }
    },
    [answer, generate, step, nextUnanswered, onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Reviewing ${item.stem}`}
      className="bg-background fixed inset-0 z-50 flex flex-col gap-4 p-4"
    >
      <span className="flex items-center gap-4">
        <span className="text-foreground text-xl font-semibold">
          {corpus.index + 1} of {corpus.items.length} · {item.stem}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="hover:bg-foreground/10 ml-auto rounded-full p-2"
        >
          <X className="size-6" />
        </button>
      </span>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="bg-muted relative min-w-0 flex-1 overflow-hidden rounded">
          {item.kind === 'image' ? (
            <Image
              // The corpus is served by our own route from local files, so the
              // optimizer would re-encode originals to no purpose.
              unoptimized
              src={mediaUrl(item.file)}
              alt={item.stem}
              fill
              className="object-contain"
            />
          ) : (
            <video
              src={mediaUrl(item.file)}
              controls
              className="size-full object-contain"
            />
          )}
        </div>

        <div className="flex w-96 shrink-0 flex-col gap-4">
          {FIELDS.map((field) => {
            const given = item.labels?.[field.id];
            return (
              <span key={field.id} className="flex items-center gap-2">
                <span className="text-sm font-medium">{field.label}</span>
                {field.options.map((option) => {
                  const chosen = given?.value === option.value;
                  const confirmed = given?.source === HUMAN;
                  return (
                    <Button
                      key={String(option.value)}
                      onClick={() => answer(field.id, option.value)}
                      className={
                        chosen && confirmed
                          ? 'bg-foreground text-background'
                          : chosen
                            ? 'border-dashed'
                            : undefined
                      }
                    >
                      {option.label}{' '}
                      <span className="opacity-50">{option.key}</span>
                    </Button>
                  );
                })}
                {given !== undefined && given.source !== HUMAN && (
                  <span className="text-muted-foreground text-xs">
                    {given.source} answered — not reviewed
                  </span>
                )}
              </span>
            );
          })}

          <span className="flex flex-wrap items-center gap-2">
            <Button onClick={() => step(-1)} disabled={corpus.index === 0}>
              ← Previous
            </Button>
            <Button
              onClick={() => step(1)}
              disabled={corpus.index >= corpus.items.length - 1}
            >
              Next →
            </Button>
            <Button onClick={nextUnanswered}>
              Next unanswered <span className="opacity-50">u</span>
            </Button>
            <Button onClick={generate} disabled={corpus.generating}>
              {corpus.generating ? 'Running…' : 'Generate'}{' '}
              <span className="opacity-50">g</span>
            </Button>
          </span>

          {corpus.error !== null && (
            <Card title="That didn't work" accent="rose">
              <span className="block text-sm break-words">{corpus.error}</span>
            </Card>
          )}

          {corpus.run !== null && (
            <Card title={`${corpus.experiment} said`} bordered>
              <pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap">
                {corpus.run.raw}
              </pre>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
