// The compare overlay: the picture being labelled beside one already labelled,
// so a value is chosen against the pictures it was chosen for before. Opened
// with `?` from the review page, over the focused field.
//
// The exemplars are the field's *confirmed* answers only. An experiment's are
// exactly the ones nobody has checked, so calibrating against them would be
// calibrating against the thing being measured.
//
// Up and down walk the field's values, left and right walk that value's
// exemplars, and Enter answers with the value on screen — the question this was
// opened to settle is which value, so it is settled here rather than by closing
// and pressing right twice. A value nobody has used yet is not skipped: that it
// is empty is worth seeing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import type { Field, FieldValue } from './fields';
import { mediaUrl, type SurveyedItem } from './item';

export function Compare({
  field,
  pack,
  item,
  items,
  onAnswer,
  onClose,
}: {
  field: Field;
  // Every picture on screen comes from the one pack: exemplars are the corpus's
  // own confirmed answers, and a corpus is one pack's media.
  pack: string;
  // The item being labelled — the left-hand picture, and the one exemplar the
  // strip never offers.
  item: SurveyedItem;
  items: SurveyedItem[];
  onAnswer: (value: FieldValue) => void;
  onClose: () => void;
}) {
  const given = item.labels?.[field.id];
  const [valueAt, setValueAt] = useState(() => {
    const at = field.options.findIndex((o) => o.value === given);
    return at === -1 ? 0 : at;
  });
  const [exemplarAt, setExemplarAt] = useState(0);

  const option = field.options[valueAt]!;

  // Every confirmed use of the value on screen — the labels hold a person's
  // answers and nothing else, so membership is the whole test. Rebuilt per
  // value rather than grouped once: the corpus is one array and this runs on a
  // keypress.
  const exemplars = useMemo(
    () =>
      items.filter(
        (other) =>
          other.stem !== item.stem && other.labels?.[field.id] === option.value,
      ),
    [items, item.stem, field.id, option.value],
  );

  // A new value starts at its first exemplar; the old position would mean
  // nothing in a different list.
  useEffect(() => setExemplarAt(0), [valueAt]);

  const shown = exemplars[Math.min(exemplarAt, exemplars.length - 1)] ?? null;

  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current
      ?.querySelector('[data-focused="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [exemplarAt, valueAt]);

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setValueAt((v) => Math.max(v - 1, 0));
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setValueAt((v) => Math.min(v + 1, field.options.length - 1));
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setExemplarAt((n) => Math.max(n - 1, 0));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setExemplarAt((n) => Math.min(n + 1, exemplars.length - 1));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        onAnswer(option.value);
        onClose();
      }
    },
    [exemplars.length, field.options.length, onAnswer, onClose, option.value],
  );

  // The review page drops its own listener while this is open, so an arrow is
  // read once — see the effect that binds it there.
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Comparing ${field.label}`}
      className="bg-background fixed inset-0 z-50 flex flex-col gap-4 p-4"
    >
      <div className="flex min-h-0 flex-1 gap-4">
        <Picture pack={pack} item={item} caption="Labelling" />
        {shown === null ? (
          <div className="bg-muted text-muted-foreground flex min-w-0 flex-1 items-center justify-center rounded text-sm">
            Nothing labelled {option.label} yet.
          </div>
        ) : (
          <Picture pack={pack} item={shown} caption={shown.stem} />
        )}
      </div>

      <span className="flex items-center gap-3">
        <span className="w-32 shrink-0 text-right text-sm font-medium">
          {field.label}
        </span>
        <span className="text-lg font-bold text-cyan-500">{option.label}</span>
        <span className="text-muted-foreground text-sm">
          {exemplars.length} labelled
          {exemplars.length > 0 &&
            ` · ${exemplarAt + 1} of ${exemplars.length}`}
        </span>
        <span className="text-muted-foreground ml-auto text-sm">
          ↑↓ value · ←→ picture · enter to answer · esc to leave
        </span>
      </span>

      <div ref={strip} className="flex gap-2 overflow-x-auto pb-1">
        {exemplars.map((other, at) => (
          <span
            key={other.stem}
            data-focused={at === exemplarAt}
            className={`relative size-20 shrink-0 overflow-hidden rounded border-2 ${
              at === exemplarAt ? 'border-cyan-500' : 'border-transparent'
            }`}
          >
            <Image
              src={mediaUrl(pack, other.file)}
              alt={other.stem}
              fill
              sizes="80px"
              loading="lazy"
              className="object-cover"
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function Picture({
  pack,
  item,
  caption,
}: {
  pack: string;
  item: SurveyedItem;
  caption: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="bg-muted relative min-h-0 flex-1 overflow-hidden rounded">
        {item.kind === 'image' ? (
          <Image
            src={mediaUrl(pack, item.file)}
            alt={item.stem}
            fill
            sizes="50vw"
            className="object-contain"
          />
        ) : (
          <video
            src={mediaUrl(pack, item.file)}
            controls
            className="size-full object-contain"
          />
        )}
      </div>
      <span className="text-muted-foreground truncate text-xs">{caption}</span>
    </div>
  );
}
