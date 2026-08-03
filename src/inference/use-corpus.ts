// The Inference screen's state: which pack's media is being labelled, which
// experiment is under examination, where you are in it, and the four things you
// can do to the item in front of you.
//
// Where you are is the URL, not state here — see route.ts. `index` is derived
// from the stem the hash names, and stepping navigates rather than setting
// anything, so a reload or a back leaves you where the address bar says. A hash
// naming no pack or no experiment is filled in from what was last selected
// (chosen.ts) and replaced, so every request has both to name.
//
// The listing is fetched once per pair and kept — it already carries every
// item's ground truth, so answering a field updates one entry in place rather
// than re-reading the corpus. What is fetched per item is the raw reply of a run
// against it, which is the largest thing the corpus holds and is only worth
// having for the item on screen.

import { useCallback, useEffect, useState } from 'react';
import { choose, remember, remembered, type Chosen } from './chosen';
import { FIELDS, type FieldValue } from './fields';
import type { Labels } from './labels';
import type { PackSource, SurveyedItem } from './item';
import { goTo, type InferenceRoute } from './route';
import type { RunFields } from './runs';

export type ItemRun = { fields: Record<string, FieldValue>; raw: string };

export type CorpusView = {
  items: SurveyedItem[];
  // What there is to choose between — every pack source holding a corpus, and
  // every experiment the registry knows — with the pair under examination and
  // that experiment's version (fingerprint.ts). All empty until the first read.
  packs: PackSource[];
  pack: string;
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
  inferring: boolean;
  error: string | null;
  step: (by: number) => void;
  nextUnanswered: () => void;
  open: (stem: string | null) => void;
  answer: (field: string, value: FieldValue) => void;
  clear: (field: string) => void;
  infer: () => void;
  // Free: re-derives from the reply already stored, with no model call.
  reparse: () => void;
  selectPack: (pack: string) => void;
  select: (experiment: string) => void;
  reload: () => void;
};

// Answered means a person has answered every field. An item an experiment has
// proposed values for is exactly what still wants looking at, and those are not
// in the labels at all, so it is not skipped.
export const isAnswered = (labels: Labels | null): boolean =>
  labels !== null && FIELDS.every((f) => labels[f.id] !== undefined);

const message = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const NONE: Chosen = { pack: '', experiment: '' };

export function useCorpus(active: boolean, route: InferenceRoute): CorpusView {
  const [packs, setPacks] = useState<PackSource[]>([]);
  const [experiments, setExperiments] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Chosen>(NONE);
  const [items, setItems] = useState<SurveyedItem[]>([]);
  const [version, setVersion] = useState('');
  const [run, setRun] = useState<ItemRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What there is to choose between, read when the tab is first opened. Every
  // other route needs a pack and an experiment named, so nothing else is
  // fetched until this has arrived. The guard is `sought` rather than a check
  // on the lists themselves: a machine where no pack holds media answers two
  // empty lists, and asking again on every render is not the response to that.
  const [sought, setSought] = useState(false);
  useEffect(() => {
    if (!active || sought) return;
    setSought(true);
    setLoading(true);
    fetch('/api/inference/packs')
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{
          packs: PackSource[];
          experiments: string[];
        }>;
      })
      .then((data) => {
        setPacks(data.packs);
        setExperiments(data.experiments);
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setLoading(false));
  }, [active, sought]);

  // Both settled at once and written back into the URL, so the address names
  // what is on screen whether it was linked, remembered or fallen back to. In
  // an effect rather than during render: storage doesn't exist on the server,
  // and a value differing between the two renders is a hydration mismatch.
  useEffect(() => {
    if (packs.length === 0 && experiments.length === 0) return;
    const settled = choose(
      route,
      packs.map((p) => p.dir),
      experiments,
      remembered(),
    );
    setChosen(settled);
    remember(settled);
    if (
      settled.pack !== route.pack ||
      settled.experiment !== route.experiment
    ) {
      goTo(settled.pack, settled.experiment, route.stem, { replace: true });
    }
  }, [packs, experiments, route]);

  const { pack, experiment } = chosen;

  const load = useCallback((forPack: string, forExperiment: string) => {
    setLoading(true);
    setError(null);
    fetch(
      `/api/inference/items?pack=${encodeURIComponent(forPack)}&experiment=${encodeURIComponent(forExperiment)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{
          items: SurveyedItem[];
          version: string;
        }>;
      })
      .then((data) => {
        setItems(data.items);
        setVersion(data.version);
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);

  const reload = useCallback(
    () => load(pack, experiment),
    [load, pack, experiment],
  );

  // Read once per pack-and-experiment pair, and not on every visit to the tab:
  // the panel stays mounted behind the other screens, and re-reading the corpus
  // because you looked at Settings would be work for nothing. Reload is the
  // button.
  const pair = `${pack}/${experiment}`;
  const [read, setRead] = useState('');
  useEffect(() => {
    if (pack === '' || experiment === '' || read === pair) return;
    setRead(pair);
    load(pack, experiment);
  }, [pack, experiment, pair, read, load]);

  const index = items.findIndex((item) => item.stem === route.stem);
  const current = items[index] ?? null;
  const stem = current?.stem;

  // Navigation writes the URL. Moving from one item to another replaces, so one
  // press of back leaves review rather than undoing a step through a thousand
  // items; entering review and leaving it push.
  const open = useCallback(
    (to: string | null) =>
      goTo(pack, experiment, to, {
        replace: to !== null && route.stem !== null,
      }),
    [pack, experiment, route.stem],
  );

  // Selecting either leaves review. The item on screen was opened under one
  // pack and one experiment, and neither the next pack nor the next experiment
  // is bound to hold it.
  const selectPack = useCallback(
    (to: string) => goTo(to, experiment, null),
    [experiment],
  );

  const select = useCallback((id: string) => goTo(pack, id, null), [pack]);

  // The raw reply for whatever is on screen, from whichever experiment is
  // selected. Cleared first, so an item with no run never shows the previous
  // item's text — or the previous experiment's — while this resolves.
  useEffect(() => {
    setRun(null);
    if (stem === undefined || pack === '' || experiment === '') return;
    let live = true;
    fetch(
      `/api/inference/run?pack=${encodeURIComponent(pack)}&stem=${encodeURIComponent(stem)}&experiment=${encodeURIComponent(experiment)}`,
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
  }, [pack, stem, experiment]);

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

  // One entry updated in place, rather than re-reading a corpus of thousands
  // because one field changed.
  const replaceLabels = useCallback((stemAt: string, labels: Labels) => {
    setItems((all) =>
      all.map((item) =>
        item.stem === stemAt ? { ...item, hasLabels: true, labels } : item,
      ),
    );
  }, []);

  const replaceRun = useCallback((stemAt: string, ran: RunFields) => {
    setItems((all) =>
      all.map((item) => (item.stem === stemAt ? { ...item, run: ran } : item)),
    );
  }, []);

  const answer = useCallback(
    (field: string, value: FieldValue) => {
      if (stem === undefined) return;
      setError(null);
      fetch(`/api/inference/labels?pack=${encodeURIComponent(pack)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stem, field, value }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          return res.json() as Promise<{ labels: Labels }>;
        })
        .then((data) => replaceLabels(stem, data.labels))
        .catch((e: unknown) => setError(message(e)));
    },
    [pack, stem, replaceLabels],
  );

  const clear = useCallback(
    (field: string) => {
      if (stem === undefined) return;
      setError(null);
      fetch(
        `/api/inference/labels?pack=${encodeURIComponent(pack)}&stem=${encodeURIComponent(stem)}&field=${encodeURIComponent(field)}`,
        { method: 'DELETE' },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          return res.json() as Promise<{ labels: Labels }>;
        })
        .then((data) => replaceLabels(stem, data.labels))
        .catch((e: unknown) => setError(message(e)));
    },
    [pack, stem, replaceLabels],
  );

  // Infer sends a picture to a model and costs money; reparse re-reads the
  // reply already on disk and costs nothing. They differ in the route they call
  // and in nothing the screen does with the answer, so one function serves both
  // and each button names its own.
  const derive = useCallback(
    (route: 'run' | 'reparse') => {
      if (stem === undefined || pack === '' || experiment === '') return;
      setInferring(true);
      setError(null);
      fetch(`/api/inference/${route}?pack=${encodeURIComponent(pack)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stem, experiment }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
          return res.json() as Promise<{ raw: string; run: RunFields }>;
        })
        .then((data) => {
          setRun({ fields: data.run.fields, raw: data.raw });
          replaceRun(stem, data.run);
        })
        .catch((e: unknown) => setError(message(e)))
        .finally(() => setInferring(false));
    },
    [pack, stem, experiment, replaceRun],
  );

  const infer = useCallback(() => derive('run'), [derive]);
  const reparse = useCallback(() => derive('reparse'), [derive]);

  return {
    items,
    packs,
    pack,
    experiments,
    experiment,
    version,
    index,
    current,
    run,
    loading,
    inferring,
    error,
    step,
    nextUnanswered,
    open,
    answer,
    clear,
    infer,
    reparse,
    selectPack,
    select,
    reload,
  };
}
