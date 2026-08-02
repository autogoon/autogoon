// The Inference screen: the corpus's counts, and one item at a time with the
// controls to answer it.
//
// Driven from the keyboard. Every option carries its own key (see fields.ts),
// the arrows move, `g` generates and `u` jumps to the next item nobody has
// answered — a mouse round-trip per item is the difference between an
// afternoon and a week at a thousand of them.

import { useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import { FIELDS } from './fields';
import { HUMAN } from './labels';
import { mediaUrl } from './item';
import { summarise } from './summary';
import { useCorpus } from './use-corpus';

// Where a keystroke means something else entirely.
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

export function InferencePanel({ active }: { active: boolean }) {
  const corpus = useCorpus(active);
  const { answer, generate, step, nextUnanswered } = corpus;
  const summary = useMemo(() => summarise(corpus.items), [corpus.items]);

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && TYPING.test(target.tagName)) return;
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
    [answer, generate, step, nextUnanswered],
  );

  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onKey]);

  const current = corpus.current;

  return (
    <Panel>
      <Card
        title="Corpus"
        action={
          <Button onClick={corpus.reload} disabled={corpus.loading}>
            {corpus.loading ? 'Reading…' : 'Reload'}
          </Button>
        }
      >
        <span className="text-muted-foreground block text-sm">
          {summary.total} items · {summary.confirmed} confirmed ·{' '}
          {summary.total - summary.confirmed - summary.untouched} awaiting
          review · {summary.untouched} untouched
        </span>
        {summary.fields.map((field) => (
          <span key={field.id} className="block text-sm">
            <span className="font-medium">{field.label}</span>{' '}
            <span className="text-muted-foreground">
              {field.values.map((v) => `${v.label} ${v.count}`).join(' · ')}
              {field.seeded > 0 ? ` — ${field.seeded} unreviewed` : ''}
            </span>
          </span>
        ))}
        {Object.entries(summary.runs).map(([id, count]) => (
          <span key={id} className="text-muted-foreground block text-sm">
            {id} has run against {count} of {summary.total}
          </span>
        ))}
      </Card>

      {corpus.error !== null && (
        <Card title="That didn't work" accent="rose">
          <span className="block text-sm break-words">{corpus.error}</span>
        </Card>
      )}

      {current === null ? (
        <Card title="Nothing to review">
          <span className="text-muted-foreground block text-sm">
            Put pictures in <code>inference-corpus/</code> and reload.
          </span>
        </Card>
      ) : (
        <Card
          title={`${corpus.index + 1} of ${corpus.items.length} · ${current.stem}`}
        >
          <div className="bg-muted relative h-[55vh] w-full overflow-hidden rounded">
            {current.kind === 'image' ? (
              <Image
                // The corpus is served by our own route from local files, so
                // the optimizer would re-encode originals to no purpose.
                unoptimized
                src={mediaUrl(current.file)}
                alt={current.stem}
                fill
                className="object-contain"
              />
            ) : (
              <video
                src={mediaUrl(current.file)}
                controls
                className="h-full w-full object-contain"
              />
            )}
          </div>

          {FIELDS.map((field) => {
            const given = current.labels?.[field.id];
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
        </Card>
      )}

      {corpus.run !== null && (
        <Card title={`${corpus.experiment} said`} bordered>
          <pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap">
            {corpus.run.raw}
          </pre>
        </Card>
      )}
    </Panel>
  );
}
