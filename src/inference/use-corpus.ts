// The Inference screen's state: the corpus, which experiment is under
// examination, where you are in it, and the four things you can do to the item
// in front of you.
//
// Where you are is the URL, not state here — see route.ts. `index` is derived
// from the stem the hash names, and stepping navigates rather than setting
// anything, so a reload or a back leaves you where the address bar says.
//
// The listing is fetched once and kept — it already carries every item's ground
// truth, so answering a field updates one entry in place rather than re-reading
// the corpus. What is fetched per item is the raw reply of a run against it,
// which is the largest thing the corpus holds and is only worth having for the
// item on screen.

import { useCallback, useEffect, useState } from 'react';
import { FIELDS, type FieldValue } from './fields';
import { HUMAN, type Labels } from './labels';
import type { SurveyedItem } from './item';
import { goTo, type InferenceRoute } from './route';
import type { RunFields } from './runs';

export type ItemRun = { fields: Record<string, FieldValue>; raw: string };

export type CorpusView = {
  items: SurveyedItem[];
  // Every experiment the registry knows, the one selected, and that one's
  // version (fingerprint.ts). Both strings are empty until the listing has
  // arrived.
  experiments: string[];
  experiment: string;
  version: string;
  // Where the item the URL names sits in the listing, and the item itself.
  // -1 and null on the summary screen, or where the hash names a stem the
  // corpus doesn't have.
  index: number;
  current: SurveyedItem | null;
  // The selected experiment's output for the item on screen, null where it
  // hasn't run against it.
  run: ItemRun | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  step: (by: number) => void;
  nextUnanswered: () => void;
  open: (stem: string | null) => void;
  answer: (field: string, value: FieldValue) => void;
  clear: (field: string) => void;
  generate: () => void;
  select: (experiment: string) => void;
  reload: () => void;
};

// Answered means answered by a person. An item an experiment has filled is
// exactly what still wants looking at, so it is not skipped.
export const isAnswered = (labels: Labels | null): boolean =>
  labels !== null && FIELDS.every((f) => labels[f.id]?.source === HUMAN);

const message = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export function useCorpus(active: boolean, route: InferenceRoute): CorpusView {
  const [items, setItems] = useState<SurveyedItem[]>([]);
  const [experiments, setExperiments] = useState<string[]>([]);
  const [experiment, setExperiment] = useState('');
  const [version, setVersion] = useState('');
  const [run, setRun] = useState<ItemRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The listing carries one experiment's results, so which one is asked for is
  // part of the request. An empty id is a URL that named none: the route
  // answers for CURRENT and names it back.
  const load = useCallback((forExperiment: string) => {
    setLoading(true);
    setError(null);
    const query =
      forExperiment === ''
        ? ''
        : `?experiment=${encodeURIComponent(forExperiment)}`;
    fetch(`/api/inference/items${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{
          items: SurveyedItem[];
          experiments: string[];
          experiment: string;
          version: string;
        }>;
      })
      .then((data) => {
        setItems(data.items);
        setExperiments(data.experiments);
        setExperiment(data.experiment);
        setVersion(data.version);
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  const reload = useCallback(() => load(experiment), [load, experiment]);

  // Read when the tab is first opened and whenever the URL names a different
  // experiment — not on every visit to the tab, since the panel stays mounted
  // behind the other screens and re-reading the corpus because you looked at
  // Settings would be work for nothing. Reload is the button.
  // `null` until the first read, which is not the same as having read the empty
  // id: a URL naming no experiment is the ordinary first visit, and it still
  // has to fetch.
  const asked = route.experiment;
  const [read, setRead] = useState<string | null>(null);
  useEffect(() => {
    if (!active || read === asked) return;
    setRead(asked);
    load(asked);
  }, [active, read, asked, load]);

  const index = items.findIndex((item) => item.stem === route.stem);
  const current = items[index] ?? null;
  const stem = current?.stem;

  // Navigation writes the URL. Moving from one item to another replaces, so one
  // press of back leaves review rather than undoing a step through a thousand
  // items; entering review and leaving it push.
  const open = useCallback(
    (to: string | null) =>
      goTo(experiment, to, { replace: to !== null && route.stem !== null }),
    [experiment, route.stem],
  );

  const select = useCallback((id: string) => goTo(id, null), []);

  // The raw reply for whatever is on screen, from whichever experiment is
  // selected. Cleared first, so an item with no run never shows the previous
  // item's text — or the previous experiment's — while this resolves.
  useEffect(() => {
    setRun(null);
    if (stem === undefined || experiment === '') return;
    let live = true;
    fetch(
      `/api/inference/run?stem=${encodeURIComponent(stem)}&experiment=${encodeURIComponent(experiment)}`,
    )
      .then(
        (res) =>
          res.json() as Promise<{ run: ItemRun | null; raw: string | null }>,
      )
      .then((data) => {
        if (!live) return;
        const fields = data.run?.fields;
        setRun(
          data.raw === null || fields === undefined
            ? null
            : { fields, raw: data.raw },
        );
      })
      .catch(() => {
        // A missing run is the ordinary case and readRun already answers null
        // for it; anything else is worth no interruption while labelling.
      });
    return () => {
      live = false;
    };
  }, [stem, experiment]);

  const step = useCallback(
    (by: number) => {
      if (index === -1) return;
      const to = items[Math.min(Math.max(index + by, 0), items.length - 1)];
      if (to !== undefined) open(to.stem);
    },
    [index, items, open],
  );

  // Forward from where you are, then from the top: the corpus is walked in
  // passes, and stopping dead at the end of one would hide what an earlier pass
  // left behind.
  const nextUnanswered = useCallback(() => {
    const order = [
      ...items.slice(index + 1).map((_, n) => index + 1 + n),
      ...items.slice(0, index + 1).map((_, n) => n),
    ];
    const to = order.find((n) => !isAnswered(items[n]?.labels ?? null));
    if (to !== undefined) open(items[to]!.stem);
  }, [index, items, open]);

  // One entry updated in place. `run` is given only where a run just happened;
  // answering a field leaves whatever the listing already held.
  const replace = useCallback(
    (stemAt: string, labels: Labels, ran?: RunFields) => {
      setItems((all) =>
        all.map((item) =>
          item.stem === stemAt
            ? {
                ...item,
                hasLabels: true,
                labels,
                ...(ran === undefined ? {} : { run: ran }),
              }
            : item,
        ),
      );
    },
    [],
  );

  const answer = useCallback(
    (field: string, value: FieldValue) => {
      if (stem === undefined) return;
      setError(null);
      fetch('/api/inference/labels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stem, field, value }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          return res.json() as Promise<{ labels: Labels }>;
        })
        .then((data) => replace(stem, data.labels))
        .catch((e: unknown) => setError(message(e)));
    },
    [stem, replace],
  );

  const clear = useCallback(
    (field: string) => {
      if (stem === undefined) return;
      setError(null);
      fetch(
        `/api/inference/labels?stem=${encodeURIComponent(stem)}&field=${encodeURIComponent(field)}`,
        { method: 'DELETE' },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          return res.json() as Promise<{ labels: Labels }>;
        })
        .then((data) => replace(stem, data.labels))
        .catch((e: unknown) => setError(message(e)));
    },
    [stem, replace],
  );

  const generate = useCallback(() => {
    if (stem === undefined || experiment === '') return;
    setGenerating(true);
    setError(null);
    fetch('/api/inference/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stem, experiment }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{
          raw: string;
          run: RunFields;
          labels: Labels;
        }>;
      })
      .then((data) => {
        setRun({ fields: data.run.fields, raw: data.raw });
        replace(stem, data.labels, data.run);
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setGenerating(false));
  }, [stem, experiment, replace]);

  return {
    items,
    experiments,
    experiment,
    version,
    index,
    current,
    run,
    loading,
    generating,
    error,
    step,
    nextUnanswered,
    open,
    answer,
    clear,
    generate,
    select,
    reload,
  };
}
