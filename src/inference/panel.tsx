// The Inference screen: what the corpus adds up to, for one experiment at a
// time. Reviewing an item happens in the modal Review opens (review.tsx), so
// this screen is only ever reporting.
//
// The experiment picker is the screen's subject — the counts describe it, and
// the modal shows and generates its replies. The ground-truth tallies are not
// its: those count what people answered, which belongs to no experiment.

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import { Review } from './review';
import { summarise } from './summary';
import { useCorpus } from './use-corpus';

export function InferencePanel({ active }: { active: boolean }) {
  const corpus = useCorpus(active);
  const summary = useMemo(
    () => summarise(corpus.items, corpus.version),
    [corpus.items, corpus.version],
  );
  const [reviewing, setReviewing] = useState(false);
  const item = corpus.current;

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
        {corpus.experiment !== '' && (
          <span className="text-muted-foreground block text-sm">
            {corpus.experiment} ({corpus.version}) has run against{' '}
            {summary.runs[corpus.experiment] ?? 0} of {summary.total}
            {summary.outdated > 0 && (
              // The experiment was edited after these ran, so their answers are
              // not what its code would produce now.
              <span className="text-amber-500">
                {' '}
                · {summary.outdated} outdated
              </span>
            )}
          </span>
        )}
        {summary.total === 0 && (
          <span className="text-muted-foreground block text-sm">
            Put pictures in <code>inference-corpus/</code> and reload.
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2 pt-2">
          {corpus.experiments.length > 0 && (
            <label className="text-muted-foreground flex items-center gap-1.5 text-sm">
              Experiment:
              <span className="relative">
                <select
                  aria-label="Experiment"
                  value={corpus.experiment}
                  onChange={(e) => corpus.select(e.target.value)}
                  className="text-foreground bg-background appearance-none rounded-lg border py-1 pr-7 pl-2 text-sm"
                >
                  {corpus.experiments.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
                <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2" />
              </span>
            </label>
          )}
          <Button
            onClick={() => setReviewing(true)}
            disabled={corpus.items.length === 0}
          >
            Review
          </Button>
        </span>
      </Card>

      {corpus.error !== null && (
        <Card title="That didn't work" accent="rose">
          <span className="block text-sm break-words">{corpus.error}</span>
        </Card>
      )}

      {/* Unmounted while another tab shows, because the modal binds the keys:
          left mounted, its option keys would answer fields from Settings. It
          comes back on the item it was left on. */}
      {active && reviewing && item !== null && (
        <Review
          corpus={corpus}
          item={item}
          onClose={() => setReviewing(false)}
        />
      )}
    </Panel>
  );
}
