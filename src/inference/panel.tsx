// The Inference tab. The URL decides which of its two screens shows (route.ts):
// the corpus summary, or one item open for review.
//
// The summary reports on the corpus for one experiment at a time. The
// experiment picker is its subject — the counts describe it, and review shows
// and generates its replies. The ground-truth tallies are not its: those count
// what people answered, which belongs to no experiment.

import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import { Failure } from './failure';
import { Review } from './review';
import { useRoute } from './route';
import { summarise } from './summary';
import { isAnswered, useCorpus } from './use-corpus';

export function InferencePanel({ active }: { active: boolean }) {
  const route = useRoute();
  const corpus = useCorpus(active, route);
  const summary = useMemo(
    () => summarise(corpus.items, corpus.version),
    [corpus.items, corpus.version],
  );

  // Review opens on the first item nobody has answered, since that is what a
  // labelling pass is for; on the first item where the pass is done.
  const start =
    corpus.items.find((item) => !isAnswered(item.labels))?.stem ??
    corpus.items[0]?.stem;

  // A URL naming an item is the review page, whether or not the listing has
  // arrived yet — falling back to the summary while it loads would flash the
  // wrong screen on every deep link and reload.
  if (route.stem !== null) {
    if (corpus.current !== null) {
      return <Review corpus={corpus} item={corpus.current} />;
    }
    return (
      <Panel>
        <Card title={corpus.loading ? 'Reading…' : 'No such item'}>
          <span className="text-muted-foreground block text-sm">
            {corpus.loading
              ? route.stem
              : `The corpus has nothing called ${route.stem}.`}
          </span>
        </Card>
      </Panel>
    );
  }

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
            onClick={() => {
              if (start !== undefined) corpus.open(start);
            }}
            disabled={start === undefined}
          >
            Review
          </Button>
        </span>
      </Card>

      <Failure error={corpus.error} />
    </Panel>
  );
}
