// The Inference screen's state: the corpus, which experiment is under
// examination, where you are in it, and the four things you can do to the item
// in front of you.
//
// The listing is fetched once and kept — it already carries every item's ground
// truth, so answering a field updates one entry in place rather than re-reading
// the corpus. What is fetched per item is the raw reply of a run against it,
// which is the largest thing the corpus holds and is only worth having for the
// item on screen.
//
// The selected experiment is the subject of everything the screen shows and
// everything Generate does. It is state here rather than a constant because the
// routes have always taken one and only ever heard CURRENT.

import { useCallback, useEffect, useState } from 'react';
import { FIELDS, type FieldValue } from './fields';
import { HUMAN, type Labels } from './labels';
import { mediaUrl, type SurveyedItem } from './item';
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

export function useCorpus(active: boolean): CorpusView {
  const [items, setItems] = useState<SurveyedItem[]>([]);
  const [experiments, setExperiments] = useState<string[]>([]);
  const [experiment, setExperiment] = useState('');
  const [version, setVersion] = useState('');
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState<ItemRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The listing carries one experiment's results, so which one is asked for is
  // part of the request. An empty id is the first load, before anything has
  // been selected: the route answers for CURRENT and names it.
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
        setIndex((i) => Math.min(i, Math.max(0, data.items.length - 1)));
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  const reload = useCallback(() => load(experiment), [load, experiment]);

  const select = useCallback(
    (id: string) => {
      setExperiment(id);
      load(id);
    },
    [load],
  );

  // Loaded when the tab is first opened, not on every visit: the panel stays
  // mounted behind the other screens, and re-reading the whole corpus because
  // you looked at Settings would be work for nothing. Reload is the button.
  useEffect(() => {
    if (!active || loaded) return;
    setLoaded(true);
    load('');
  }, [active, loaded, load]);

  const current = items[index] ?? null;
  const stem = current?.stem;

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

  // The next picture, fetched before it is asked for — at a thousand items the
  // wait between two of them is the whole experience.
  const nextFile = items[index + 1]?.file;
  useEffect(() => {
    if (nextFile === undefined) return;
    const img = new Image();
    img.src = mediaUrl(nextFile);
  }, [nextFile]);

  const step = useCallback(
    (by: number) =>
      setIndex((i) =>
        Math.min(Math.max(i + by, 0), Math.max(0, items.length - 1)),
      ),
    [items.length],
  );

  // Forward from where you are, then from the top: the corpus is walked in
  // passes, and stopping dead at the end of one would hide what an earlier pass
  // left behind.
  const nextUnanswered = useCallback(() => {
    setIndex((i) => {
      const order = [
        ...items.slice(i + 1).map((_, n) => i + 1 + n),
        ...items.slice(0, i + 1).map((_, n) => n),
      ];
      return order.find((n) => !isAnswered(items[n]?.labels ?? null)) ?? i;
    });
  }, [items]);

  // One entry updated in place. `run` is given only where a run just happened;
  // answering a field leaves whatever the listing already held.
  const replace = useCallback(
    (stemAt: string, labels: Labels, run?: RunFields) => {
      setItems((all) =>
        all.map((item) =>
          item.stem === stemAt
            ? {
                ...item,
                hasLabels: true,
                labels,
                ...(run === undefined ? {} : { run }),
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
    answer,
    clear,
    generate,
    select,
    reload,
  };
}
