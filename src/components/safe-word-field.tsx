// The safe word editor — input + Test button — shared by the Settings screen
// and any play mode setup view that surfaces it (Goon). The saved word is
// app-level state owned by the page (both surfaces stay mounted, so edits on
// one must show on the other); this component holds only the draft being
// typed and the test modal.
//
// The Test button exists because vosk can only recognise words in its model's
// vocabulary — a typed word the model doesn't know would silently never fire.
// Testing narrows the grammar to just the candidate (see the exclusive slot in
// keyword-spotter.tsx).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/button';
import {
  CONTROL_BORDER,
  CONTROL_BUTTON,
  CONTROL_INPUT,
} from '@/components/controls';
import { useKeywordSpotter } from '@/components/keyword-spotter';

export function SafeWordField({
  safeWord,
  sanitize,
  onSave,
}: {
  safeWord: string;
  // Validates a draft (trim/lowercase/single word/not reserved); null = invalid.
  sanitize: (input: string) => string | null;
  // Receives an already-sanitized word.
  onSave: (word: string) => void;
}) {
  const [draft, setDraft] = useState(safeWord);
  const [invalid, setInvalid] = useState(false);
  const [testWord, setTestWord] = useState<string | null>(null);

  // Follow saves made on the other editing surface.
  useEffect(() => {
    setDraft(safeWord);
    setInvalid(false);
  }, [safeWord]);

  // Commit on blur/Enter: a valid draft is saved (and shown cleaned up); an
  // invalid one is left in the field with the error line, saved word untouched.
  const commit = () => {
    const word = sanitize(draft);
    if (word === null) {
      setInvalid(draft.trim() !== '');
      setDraft(draft.trim() === '' ? safeWord : draft);
      return;
    }
    setInvalid(false);
    setDraft(word);
    if (word !== safeWord) onSave(word);
  };

  const candidate = sanitize(draft);

  return (
    <div className="space-y-4">
      <p>
        Say the safe word at any time while playing to stop the device
        instantly.
      </p>
      <p>
        Some end-of-play options will deliberately ignore{' '}
        <span className="text-foreground">stop</span> — the safe word always
        works, so it&rsquo;s how you halt those if you need to.
      </p>
      <p>Use Test to make sure the app can recognise your word.</p>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-label="Safe word"
          spellCheck={false}
          autoComplete="off"
          className={`${CONTROL_INPUT} min-w-0 flex-1`}
        />
        <Button
          onClick={() => setTestWord(candidate)}
          disabled={candidate === null}
          className={`${CONTROL_BUTTON} shrink-0`}
        >
          Test
        </Button>
      </div>
      {invalid && (
        <p className="text-destructive text-sm">
          One word, letters only, and not a word the app already uses.
        </p>
      )}
      {testWord !== null && (
        <SafeWordTestModal word={testWord} onClose={() => setTestWord(null)} />
      )}
    </div>
  );
}

function SafeWordTestModal({
  word,
  onClose,
}: {
  word: string;
  onClose: () => void;
}) {
  const { setExclusiveTestWord, keywordListener, partialListener, listening } =
    useKeywordSpotter();
  // Each detection lights the (always-present) Recognised line up for 3s —
  // the layout never changes size, and repeat detections restart the flash.
  const [lit, setLit] = useState(false);
  const litTimerRef = useRef<number | null>(null);
  // True while the decoder has an in-flight partial — vosk is hearing
  // something but hasn't settled on a result yet. Drives the spinner, so the
  // gap between speaking and the (final-result) detection reads as activity
  // rather than a miss. Partials fire per audio chunk with the same "" during
  // silence; React bails out of the no-change setStates, so this is cheap.
  const [hearing, setHearing] = useState(false);

  // While open, the recognizer listens for ONLY this word (the spotter's
  // exclusive slot), cleared on close/unmount. No other voice command works
  // meanwhile — safe, because Settings and setup views are only reachable
  // while nothing is playing, so the narrowed grammar can't strand a session.
  useEffect(() => {
    setExclusiveTestWord(word);
    return () => setExclusiveTestWord(null);
  }, [word, setExclusiveTestWord]);

  useEffect(() => {
    const unsubscribe = keywordListener((heard) => {
      if (heard !== word) return;
      setLit(true);
      if (litTimerRef.current !== null) clearTimeout(litTimerRef.current);
      litTimerRef.current = window.setTimeout(() => setLit(false), 3000);
    });
    return () => {
      unsubscribe();
      if (litTimerRef.current !== null) clearTimeout(litTimerRef.current);
    };
  }, [keywordListener, word]);

  useEffect(
    () => partialListener((text) => setHearing(text.trim() !== '')),
    [partialListener],
  );

  // Portaled to <body>: rendered in place it would count as a sibling in the
  // field's space-y stack and shift the layout below by the stack margin.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`bg-background w-full max-w-sm space-y-4 rounded-xl border ${CONTROL_BORDER} p-6 text-center`}
      >
        <h2 className="font-semibold">Safe word test</h2>
        {!listening ? (
          <p className="text-muted-foreground text-sm">
            The microphone is off — turn on listening (in the header bar) to
            test.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Say <code className="text-foreground font-semibold">{word}</code>{' '}
              now…
            </p>
            <div className="flex h-7 items-center justify-center">
              {hearing && !lit ? (
                <LoaderCircle className="size-5 animate-spin text-emerald-500" />
              ) : (
                <p
                  className={`text-lg font-bold text-emerald-500 transition-opacity duration-300 ${
                    lit ? 'opacity-100' : 'opacity-20'
                  }`}
                >
                  ✓ Recognised
                </p>
              )}
            </div>
          </>
        )}
        <Button
          onClick={onClose}
          className="bg-secondary w-full rounded-lg py-2 font-medium"
        >
          Close
        </Button>
      </div>
    </div>,
    document.body,
  );
}
