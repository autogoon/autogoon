// The review page: one corpus item filling the screen, with the controls that
// answer it — the picture beside the fields, the navigation, and the selected
// experiment's reply.
//
// A page rather than an overlay, addressed by `#inference/<experiment>/<stem>`
// (route.ts). An item can be linked and reloaded, the breadcrumb and the
// browser's back both leave, and Escape belongs to whatever opens on top.
//
// The arrows walk the field set: up and down between fields, left and right
// along the focused field's options. A letter per option would be faster to
// press and impossible to keep unique — one keypress has to answer whichever
// field owns it, so every option in the set would need its own letter. Moving
// left or right answers as it goes, as a radio group does, so setting a value
// is still one keypress. Item navigation takes the letters the arrows gave up:
// `a` and `d`, which the hand is already over.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import Image from 'next/image';
import { Bot, FileText, X } from 'lucide-react';
import { Button } from '@/components/button';
import { Compare } from './compare';
import { Floating } from './floating';
import { Failure } from './failure';
import { FIELDS, type FieldValue } from './fields';
import { mediaUrl, type SurveyedItem } from './item';
import { routeHash } from './route';
import type { CorpusView } from './use-corpus';

// Where a keystroke means something else entirely.
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

// What the picture frame takes of the window, for the optimizer to size
// against: everything but the rail beside it.
const FRAME = 'calc(100vw - 44rem)';

// How wide anything that opens beside the rail is. Floating clamps it to the
// window, so this is a preference rather than a promise.
const PANEL_WIDTH = 'w-160';

// What the selected experiment answered: under a choice it proposed, and under
// the word in the legend that says so. White, because a button's label is at
// full contrast and a mark under it that isn't reads as an artefact.
const PROPOSED = 'decoration-0.5 underline decoration-white underline-offset-4';

// The same mark in a text row. The wording there is already muted, so the
// underline is dimmed with it rather than sitting brighter than the text.
const PROPOSED_TEXT = `${PROPOSED} decoration-foreground/40`;

export function Review({
  corpus,
  // The item on screen, passed separately from the view: the panel renders this
  // only for an item that exists, and saying so here keeps the null out.
  item,
}: {
  corpus: CorpusView;
  item: SurveyedItem;
}) {
  const { answer, clear, infer, reparse, step, nextUnanswered } = corpus;
  const [focus, setFocus] = useState(0);
  const [comparing, setComparing] = useState(false);
  // The text field being typed into, by id. While one is open the input holds
  // the keyboard — TYPING drops every global key — so this is also what says
  // the shortcuts are suspended.
  const [editing, setEditing] = useState<string | null>(null);
  // The text field whose two answers are open side by side, by id.
  const [showing, setShowing] = useState<string | null>(null);
  // Whether the reply verbatim is open over the page.
  const [reading, setReading] = useState(false);
  const field = FIELDS[focus];

  // A new item starts at the top of the field set, so the first left or right
  // always means the same field however the last item was left. Anything half
  // typed goes with it, and so does anything open over it: both were about the
  // picture that just left the screen.
  useEffect(() => {
    setFocus(0);
    setEditing(null);
    setShowing(null);
    setReading(false);
  }, [item.stem]);

  // Move along the focused field's options, answering where you land. An
  // unanswered field has no position to move from, so right enters at the first
  // option and left at the last; from then on it steps and stops at the ends.
  //
  // A text field has no options to step along, so right opens its editor —
  // right is "answer this" for every field, and what answering means differs.
  // Left does nothing there: it means "back along the options", and there are
  // none.
  const shift = useCallback(
    (by: number) => {
      const field = FIELDS[focus];
      if (field === undefined) return;
      if (field.kind === 'text') {
        if (by > 0) setEditing(field.id);
        return;
      }
      const at = field.options.findIndex(
        (o) => o.value === item.labels?.[field.id],
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
      if (event.key === 'Escape' && (showing !== null || reading)) {
        event.preventDefault();
        setShowing(null);
        setReading(false);
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
        // The Review button that navigated here may still hold focus, and a
        // keydown Enter would press it again.
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
      // Nothing to compare a text answer against: exemplars are the items
      // sharing a value, and no two descriptions share one.
      if (event.key === '?') {
        event.preventDefault();
        if (FIELDS[focus]?.kind === 'choice') setComparing(true);
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
      if (key === 'i') infer();
      if (key === 'r') reparse();
    },
    [
      clear,
      focus,
      infer,
      reading,
      reparse,
      shift,
      showing,
      step,
      nextUnanswered,
    ],
  );

  // Dropped while the compare overlay is open, so one press of an arrow is read
  // by one screen. The overlay binds its own.
  useEffect(() => {
    if (comparing) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey, comparing]);

  if (comparing && field !== undefined && field.kind === 'choice') {
    return (
      <Compare
        field={field}
        pack={corpus.pack}
        item={item}
        items={corpus.items}
        onAnswer={(value) => answer(field.id, value)}
        onClose={() => setComparing(false)}
      />
    );
  }

  return (
    <div className="bg-background fixed inset-0 z-40 flex flex-col gap-4 p-4">
      {/* A real link, not a button: the address it goes to is the address the
          page already has one segment of, so it opens in a new tab and copies
          like any other. */}
      <span className="flex items-center gap-2 text-xl">
        <a
          href={routeHash(corpus.pack, corpus.experiment)}
          className="text-muted-foreground hover:text-foreground"
        >
          Inference
        </a>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{corpus.pack}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{corpus.experiment}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground font-semibold">{item.stem}</span>
        {/* The word is underlined itself. It reads as a legend for the screen
            rather than a note about this item, so it stays put whether or not
            the experiment has answered the one on show. */}
        <span className="text-muted-foreground flex-1 text-center text-sm">
          <span className={PROPOSED}>Underlined</span> values are what{' '}
          {corpus.experiment} answered.
        </span>
        <span className="text-muted-foreground text-sm">
          {corpus.index + 1} of {corpus.items.length}
        </span>
      </span>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="bg-muted relative min-w-0 flex-1 overflow-hidden rounded">
          {item.kind === 'image' ? (
            <Image
              src={mediaUrl(corpus.pack, item.file)}
              alt={item.stem}
              fill
              sizes={FRAME}
              className="object-contain"
            />
          ) : (
            <video
              src={mediaUrl(corpus.pack, item.file)}
              controls
              className="size-full object-contain"
            />
          )}
        </div>

        <div className="flex w-160 flex-col justify-between">
          <div className="flex flex-col gap-16">
            <div className="flex flex-col gap-2">
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
                    {field.kind === 'text' ? (
                      <TextAnswer
                        given={given}
                        proposed={proposed}
                        experiment={corpus.experiment}
                        multiline={field.multiline === true}
                        whole={field.whole === true}
                        editing={editing === field.id}
                        showing={showing === field.id}
                        onEdit={() => {
                          setFocus(at);
                          setEditing(field.id);
                        }}
                        onShow={() =>
                          setShowing((open) =>
                            open === field.id ? null : field.id,
                          )
                        }
                        onUse={() => {
                          setShowing(null);
                          if (proposed !== undefined) {
                            answer(field.id, proposed);
                          }
                        }}
                        onDone={(value) => {
                          setEditing(null);
                          if (value === undefined || value === given) return;
                          if (value === '') clear(field.id);
                          else answer(field.id, value);
                        }}
                      />
                    ) : (
                      field.options.map((option) => {
                        // Only a person's answer fills a button — the labels
                        // hold nothing else. An experiment's is the underline,
                        // so a field it answered and nobody has confirmed reads
                        // as still open.
                        const confirmed = given === option.value;
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
                              at === focus
                                ? 'border-cyan-500 py-1 text-cyan-500'
                                : 'py-1'
                            } ${confirmed ? 'bg-cyan-600 text-white' : ''} ${
                              proposed === option.value ? PROPOSED : ''
                            }`}
                          >
                            {option.label}
                          </Button>
                        );
                      })
                    )}
                  </span>
                );
              })}
            </div>

            <Failure error={corpus.error} />
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

            <span className="relative flex gap-2">
              {/* The reply verbatim is what a wrong answer is diagnosed
                  against, and it is pages long. Behind an icon rather than
                  under the rail, so the fields keep the room. */}
              <Button
                onClick={() => setReading((open) => !open)}
                disabled={corpus.run === null}
                aria-label={`What ${corpus.experiment} replied`}
                aria-expanded={reading}
                className="px-2"
              >
                <FileText className="size-4" />
              </Button>
              {reading && corpus.run !== null && (
                <Reply
                  raw={corpus.run.raw}
                  experiment={corpus.experiment}
                  onClose={() => setReading(false)}
                />
              )}
              <Button onClick={infer} disabled={corpus.inferring}>
                {corpus.inferring
                  ? 'Running…'
                  : corpus.run !== null
                    ? 'Infer again'
                    : 'Infer'}{' '}
                <span className="opacity-50">i</span>
              </Button>
              {/* Only where there is a stored reply to read again, since that
                  is the whole of what it works from. */}
              <Button
                onClick={reparse}
                disabled={corpus.inferring || corpus.run === null}
              >
                Reparse <span className="opacity-50">r</span>
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// A text field's answer: what was written, or an input while it is being
// written. The editor opens holding whatever there is to start from — what a
// person answered, else what the experiment proposed — so taking the model's
// wording is right then enter, the two keystrokes a choice field costs.
//
// `onDone` is given the text to keep, or `undefined` where the edit was
// abandoned. Escape abandons through a ref rather than by unmounting first,
// because the blur that follows would otherwise commit what Escape rejected.
function TextAnswer({
  given,
  proposed,
  experiment,
  multiline,
  whole,
  editing,
  showing,
  onEdit,
  onShow,
  onUse,
  onDone,
}: {
  given: FieldValue | undefined;
  proposed: FieldValue | undefined;
  experiment: string;
  // Paragraphs rather than a line, so the editor is a textarea and Enter is a
  // newline in it.
  multiline: boolean;
  // The row shows all of it rather than clipping to a line.
  whole: boolean;
  editing: boolean;
  // Whether the two answers are open side by side. Held by the page rather than
  // here, so leaving the item closes it along with anything half typed.
  showing: boolean;
  onEdit: () => void;
  onShow: () => void;
  onUse: () => void;
  onDone: (value: string | undefined) => void;
}) {
  const abandoned = useRef(false);
  const [peeking, setPeeking] = useState(false);
  const row = useRef<HTMLSpanElement>(null);
  const mark = useRef<HTMLButtonElement>(null);

  // Clicking the row swaps it for the editor under the pointer, so the row
  // never sees the pointer leave and would still think it is hovered when the
  // editor closes.
  useEffect(() => {
    if (editing) setPeeking(false);
  }, [editing]);

  if (!editing) {
    // Where nobody has answered, the experiment's own words stand in the row,
    // underlined as they are on a choice field. Once somebody has answered, the
    // row is theirs — and the experiment disagreeing is worth seeing, so it
    // keeps a mark of its own rather than disappearing.
    const disagrees =
      given !== undefined &&
      proposed !== undefined &&
      String(proposed) !== String(given);
    const shown = given ?? proposed;
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          ref={row}
          role="button"
          tabIndex={0}
          onClick={() => {
            setPeeking(false);
            onEdit();
          }}
          onMouseEnter={() => setPeeking(true)}
          onMouseLeave={() => setPeeking(false)}
          // The same box a choice field's buttons sit in, so a row is the same
          // height whichever kind of field it asks. A description is clamped to
          // two lines rather than one — one line of a paragraph says almost
          // nothing — and a field marked `whole` gives up the matching height to
          // be read in full.
          className={`min-w-0 flex-1 cursor-text rounded-lg border border-transparent px-3 py-1 text-sm ${
            whole
              ? 'whitespace-pre-wrap'
              : multiline
                ? 'line-clamp-4 max-h-26'
                : 'truncate'
          }`}
        >
          {given !== undefined ? (
            String(given)
          ) : proposed !== undefined ? (
            <span className={`text-muted-foreground ${PROPOSED_TEXT}`}>
              {String(proposed)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
        {/* The row cuts a long answer off, and what it cut is what you want to
            read. Hover rather than click, since it only shows and never acts —
            the panel with the buttons in it is a different thing. Nothing to
            peek at where the row already shows the whole answer. */}
        {peeking && !whole && !showing && shown !== undefined && (
          <Floating anchor={row} className={`${PANEL_WIDTH} text-sm`}>
            <span className="whitespace-pre-wrap">{String(shown)}</span>
          </Floating>
        )}
        {disagrees && (
          <button
            ref={mark}
            type="button"
            aria-label={`What ${experiment} answered`}
            aria-expanded={showing}
            onClick={onShow}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Bot className="size-4" />
          </button>
        )}
        {disagrees && showing && (
          <Disagreement
            anchor={mark}
            given={String(given)}
            proposed={String(proposed)}
            experiment={experiment}
            onUse={onUse}
            onClose={onShow}
          />
        )}
      </span>
    );
  }

  // Escape abandons through the ref rather than by unmounting first, because
  // the blur that follows would otherwise commit what Escape rejected.
  const keys = {
    onKeyDown: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        abandoned.current = true;
        e.currentTarget.blur();
      }
      // Enter commits a one-line answer and is a newline in a description, so
      // the long box is left with Escape or by clicking away.
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const abandon = abandoned.current;
      abandoned.current = false;
      onDone(abandon ? undefined : e.currentTarget.value.trim());
    },
  };

  const started = String(given ?? proposed ?? '');
  // The same box the row shows at rest, so opening one shifts nothing.
  const style =
    'text-foreground bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm';

  return multiline ? (
    <textarea
      autoFocus
      rows={12}
      aria-label="Answer"
      defaultValue={started}
      {...keys}
      className={style}
    />
  ) : (
    <input
      autoFocus
      aria-label="Answer"
      defaultValue={started}
      {...keys}
      className={style}
    />
  );
}

// The reply the experiment gave, verbatim, over a dimmed page. It is what a
// wrong answer is read against, and it is pages long, so it opens rather than
// living in the rail.
function Reply({
  raw,
  experiment,
  onClose,
}: {
  raw: string;
  experiment: string;
  onClose: () => void;
}) {
  return (
    <>
      <span
        onClick={onClose}
        className="fixed inset-0 z-10 bg-black/60"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`What ${experiment} replied`}
        className="bg-background fixed inset-y-8 left-1/2 z-20 flex w-xl max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-3 rounded-lg border p-4 shadow-lg"
      >
        <span className="flex items-center">
          <span className="flex-1 font-semibold">{experiment} said</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </span>
        <div className="flex-1 overflow-y-auto text-sm whitespace-pre-wrap">
          {raw}
        </div>
      </div>
    </>
  );
}

// The two answers to a text field side by side, and the choice between them. A
// panel rather than a `title` tooltip: both are paragraphs, and a tooltip can
// hold neither of them legibly nor the buttons to act on them.
//
// Both buttons name what they take, rather than one saying "use this": with two
// paragraphs on screen, a button has to say which one it means.
function Disagreement({
  anchor,
  given,
  proposed,
  experiment,
  onUse,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  given: string;
  proposed: string;
  experiment: string;
  onUse: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Dims the page and takes the click that closes it, so nothing behind
          this answers a field while it is open. */}
      <span
        onClick={onClose}
        className="fixed inset-0 z-20 bg-black/60"
        aria-hidden
      />
      <Floating
        anchor={anchor}
        role="dialog"
        label={`Yours and ${experiment}'s`}
        className={`${PANEL_WIDTH} flex flex-col gap-3`}
      >
        <span className="flex flex-col gap-1">
          <span className="flex items-center">
            <span className="text-muted-foreground flex-1 text-xs font-medium">
              Yours
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </span>
          <span className="text-sm whitespace-pre-wrap">{given}</span>
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">
            {experiment}
          </span>
          <span className="text-sm whitespace-pre-wrap">{proposed}</span>
        </span>
        <span className="flex justify-end gap-2">
          {/* Yours is already the answer, so taking it is leaving. It is a
              button because the choice is between two, and one of them
              unnamed reads as no choice at all. */}
          <Button onClick={onClose}>Use yours</Button>
          <Button onClick={onUse}>Use {experiment}</Button>
        </span>
      </Floating>
    </>
  );
}
