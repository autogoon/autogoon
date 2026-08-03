// The review modal: one corpus item filling the screen, with the controls that
// answer it — the picture beside the fields, the navigation, and the selected
// experiment's reply.
//
// The keys are bound here rather than on the screen behind it, so they answer
// only while there is an item to answer. Escape and the ✕ close it; the
// backdrop does not, because the modal covers the screen and a click landing
// outside the picture is a slip rather than an intention.
//
// The arrows walk the field set: up and down between fields, left and right
// along the focused field's options. A letter per option would be faster to
// press and impossible to keep unique — one keypress has to answer whichever
// field owns it, so every option in the set would need its own letter. Moving
// left or right answers as it goes, as a radio group does, so setting a value
// is still one keypress. Item navigation takes the letters the arrows gave up:
// `a` and `d`, which the hand is already over.

import { useCallback, useEffect, useState } from 'react';
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
  const { answer, clear, generate, step, nextUnanswered } = corpus;
  const [focus, setFocus] = useState(0);

  // A new item starts at the top of the field set, so the first left or right
  // always means the same field however the last item was left.
  useEffect(() => setFocus(0), [item.stem]);

  // Move along the focused field's options, answering where you land. An
  // unanswered field has no position to move from, so right enters at the first
  // option and left at the last; from then on it steps and stops at the ends.
  const shift = useCallback(
    (by: number) => {
      const field = FIELDS[focus];
      if (field === undefined) return;
      const at = field.options.findIndex(
        (o) => o.value === item.labels?.[field.id]?.value,
      );
      const to =
        at === -1
          ? by > 0
            ? 0
            : field.options.length - 1
          : Math.min(Math.max(at + by, 0), field.options.length - 1);
      answer(field.id, field.options[to]!.value);
    },
    [focus, item.labels, answer],
  );

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && TYPING.test(target.tagName)) return;
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocus((f) => Math.max(f - 1, 0));
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocus((f) => Math.min(f + 1, FIELDS.length - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        shift(1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        shift(-1);
        return;
      }
      if (event.key === 'Enter') {
        // The Review button that opened this still holds focus behind the
        // modal, and a keydown Enter would press it again.
        event.preventDefault();
        nextUnanswered();
        return;
      }
      // Both, because the key marked "delete" on a Mac laptop reports as
      // Backspace — which some browsers also read as "go back".
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        const field = FIELDS[focus];
        if (field !== undefined) clear(field.id);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'a') {
        step(-1);
        return;
      }
      if (key === 'd') {
        step(1);
        return;
      }
      if (key === 'g') generate();
    },
    [clear, focus, generate, shift, step, nextUnanswered, onClose],
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

        <div className="flex w-160 flex-col justify-between">
          <div className="flex flex-col gap-16">
            <div className="flex flex-col gap-2">
              {/* The word is underlined itself. The note renders only where the
                  experiment has run against this item, since nothing below is
                  underlined otherwise. */}
              {corpus.run !== null && (
                <span className="text-muted-foreground mb-4 pl-2 text-sm">
                  <span className="underline decoration-2 underline-offset-4">
                    Underlined
                  </span>{' '}
                  values are what {corpus.experiment} answered.
                </span>
              )}
              {FIELDS.map((field, at) => {
                const given = item.labels?.[field.id];
                // What the selected experiment said, shown whatever the ground
                // truth now holds: an answer only scores against the one it
                // disagrees with, so both have to be on screen at once.
                const proposed = corpus.run?.fields[field.id];
                return (
                  <span
                    key={field.id}
                    // The focused row is the one the arrows answer. Every row
                    // has the border and only its colour changes, so gaining
                    // focus never shifts the row sideways.
                    className={`flex items-center gap-2 border-l-2 pl-2 ${
                      at === focus ? 'border-cyan-500' : 'border-transparent'
                    }`}
                  >
                    {/* A fixed width, so every field's buttons start on the
                        same line however long its label runs. */}
                    <span
                      className={`w-32 shrink-0 text-right text-sm ${
                        at === focus ? 'font-bold text-cyan-500' : 'font-medium'
                      }`}
                    >
                      {field.label}
                    </span>
                    {field.options.map((option) => {
                      // Only a person's answer fills a button. An experiment's
                      // is the underline, so a field it answered and nobody has
                      // confirmed reads as still open.
                      const confirmed =
                        given?.source === HUMAN && given.value === option.value;
                      return (
                        <Button
                          key={String(option.value)}
                          // Clicking a field's option focuses it too: the next
                          // arrow then moves where the eye already is.
                          onClick={() => {
                            setFocus(at);
                            answer(field.id, option.value);
                          }}
                          // The focused row's tint goes first, so Button's
                          // twMerge lets the confirmed fill override it where
                          // the two collide. The underline conflicts with
                          // neither: it is a separate property, the
                          // experiment's answer.
                          className={`${
                            at === focus ? 'border-cyan-500 text-cyan-500' : ''
                          } ${confirmed ? 'bg-cyan-600 text-white' : ''} ${
                            proposed === option.value
                              ? 'underline decoration-2 underline-offset-4'
                              : ''
                          }`}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </span>
                );
              })}
            </div>

            {corpus.error !== null && (
              <Card title="That didn't work" accent="rose">
                <span className="block text-sm wrap-break-word">
                  {corpus.error}
                </span>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <span className="flex flex-wrap items-center gap-2">
              <Button onClick={() => step(-1)} disabled={corpus.index === 0}>
                Previous <span className="opacity-50">a</span>
              </Button>
              <Button
                onClick={() => step(1)}
                disabled={corpus.index >= corpus.items.length - 1}
              >
                Next <span className="opacity-50">d</span>
              </Button>
              <Button onClick={nextUnanswered} className="ml-auto">
                Next unanswered <span className="opacity-50">enter</span>
              </Button>
            </span>

            {corpus.run !== null && (
              <Card title={`${corpus.experiment} said`} bordered>
                <pre className="text-[10px] whitespace-pre-wrap">
                  {corpus.run.raw}
                </pre>
              </Card>
            )}
            <Button onClick={generate} disabled={corpus.generating}>
              {corpus.generating
                ? 'Running…'
                : corpus.run !== null
                  ? 'Regenerate'
                  : 'Generate'}{' '}
              <span className="opacity-50">g</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
