// Choosing the model every companion runs on, and the provider it routes to, by
// what each costs and how fast each answers rather than by pasting a slug.
//
// The catalogue is ~650 KB, so it is fetched when the picker is opened and not
// before; the chosen model's own providers are ~4 KB and are fetched whenever
// the choice changes. Latency needs the OpenRouter key, so a browser with no key
// stored gets the rest of the card and no speed line.
//
// Settings, not play: set once with a free hand, so nothing here has a voice
// command.

import { useCallback, useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import type { ModelSettingsState } from '@/hooks/use-model-settings';
import type { ApiKeysState } from '@/hooks/use-api-keys';
import {
  type CatalogueModel,
  type ModelDetail,
  type ModelEndpoint,
  type Span,
  OPENROUTER_API,
  candidates,
  fetchCatalogue,
  fetchModelDetail,
  pricePerMillion,
  terms,
} from '@/lib/companions/model-catalogue';
import { type Routing } from '@/lib/companions/model-settings';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Segmented } from '@/components/segmented';
import {
  CONTROL_BORDER,
  CONTROL_BUTTON,
  CONTROL_INPUT,
} from '@/components/controls';

const STREAM_OPTIONS = [
  { value: 'stream', label: 'Word by word' },
  { value: 'whole', label: 'All at once' },
] as const;

const REASONING_OPTIONS = [
  { value: 'pass', label: 'Send it back' },
  { value: 'drop', label: 'Leave it out' },
] as const;

// Default, Nitro, Floor and Exacto are OpenRouter's names, matching its
// documentation and the slug suffixes. Pinned is `provider.only`, which has no
// name of its own. All five are built in model-settings.ts.
const ROUTING_OPTIONS = [
  // One word each: five segments share a row, and a label that wraps makes the
  // whole control two lines tall on a phone.
  { value: 'provider', label: 'Pinned' },
  { value: 'normal', label: 'Default' },
  { value: 'nitro', label: 'Nitro' },
  { value: 'floor', label: 'Floor' },
  { value: 'exacto', label: 'Exacto' },
] as const satisfies ReadonlyArray<{ value: Routing; label: string }>;

// What each sorts on: nothing in the names says.
const ROUTING_BLURB: Record<Routing, string> = {
  provider:
    'Routes to the one endpoint below and no other. Busy or down, the request fails rather than moving to another provider.',
  normal: "OpenRouter's default: price-weighted load balancing.",
  nitro: 'Sorted by throughput.',
  floor: 'Sorted by price.',
  exacto: 'Sorted by tool-calling reliability.',
};

// Per million tokens, and never rounded to $0.00: the cheap models are the
// interesting end of the list, and three places is what separates them.
const money = (perToken: number): string => {
  const perMillion = pricePerMillion(perToken);
  if (perMillion === 0) return 'free';
  return `$${perMillion < 1 ? perMillion.toFixed(3) : perMillion.toFixed(2)}`;
};

const tokens = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    : `${Math.round(n / 1000)}K`;

const seconds = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

// One number when the ends agree, low–high when they don't. Never an average:
// that is a price no provider charges.
const spread = (s: Span, fmt: (n: number) => string): string =>
  s.low === s.high ? fmt(s.low) : `${fmt(s.low)}–${fmt(s.high)}`;

// One endpoint's figures, as a row in the pinning list. Price first: it is the
// reason to read the list.
function endpointLine(endpoint: ModelEndpoint): string {
  const parts = [
    `${money(endpoint.promptPrice)} / ${money(endpoint.completionPrice)}`,
    `${tokens(endpoint.contextLength)} context`,
  ];
  if (endpoint.speed !== null) {
    parts.push(
      `${seconds(endpoint.speed.latencyMs)} to first token`,
      `${Math.round(endpoint.speed.tps)} tok/s`,
    );
  }
  if (endpoint.down) parts.push('down');
  return parts.join(' · ');
}

export function ModelCard({
  modelSettings,
  apiKeys,
}: {
  modelSettings: ModelSettingsState;
  apiKeys: ApiKeysState;
}) {
  const { checked, settings, save } = modelSettings;
  const [detail, setDetail] = useState<ModelDetail | null | undefined>(
    undefined,
  );
  const [catalogue, setCatalogue] = useState<CatalogueModel[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const key = apiKeys.keys.openRouterKey;
  // The catalogue is OpenRouter's own, in its own shapes. Pointed at another
  // OpenAI-compatible endpoint, the picker has nothing to offer, routing means
  // nothing, and the slug is typed instead.
  const onOpenRouter = apiKeys.keys.llmUrl.startsWith(OPENROUTER_API);

  // The chosen model's endpoints. Re-run on every change of choice, so the
  // lines under the name always describe what is actually selected.
  useEffect(() => {
    if (!checked || key === '' || !onOpenRouter) {
      // Not "unknown model" — nothing was asked. Leaving the last model's
      // providers on screen would attribute them to this one.
      setDetail(undefined);
      return;
    }
    const abort = new AbortController();
    setDetail(undefined);
    fetchModelDetail(settings.model, key, abort.signal)
      .then((d) => {
        setDetail(d);
        setFailure(null);
      })
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        setFailure(e instanceof Error ? e.message : String(e));
      });
    return () => {
      abort.abort();
    };
  }, [checked, key, onOpenRouter, settings.model]);

  const openPicker = useCallback((): void => {
    setPicking(true);
    if (catalogue !== null) return;
    fetchCatalogue()
      .then(setCatalogue)
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : String(e));
      });
  }, [catalogue]);

  if (!checked) return null;

  const choose = (model: CatalogueModel): void => {
    save({
      ...settings,
      model: model.id,
      // A pin belongs to the model it was chosen on: the same provider may not
      // serve the new one, and an unknown tag routes nowhere.
      provider: '',
      // A model that doesn't reason has no reasoning to pass back, so the
      // switch goes off with the choice rather than sitting on and doing
      // nothing.
      passesReasoning: model.hasReasoning && settings.passesReasoning,
    });
    setPicking(false);
    setFilter('');
  };

  // The endpoints a request could reach — the pinned one, or all that are up —
  // and their terms as a range.
  const pinned = settings.routing === 'provider' ? settings.provider : '';
  const reachable = detail == null ? [] : candidates(detail, pinned);
  const spans = terms(reachable);
  const reasons = spans?.hasReasoning;

  const needle = filter.trim().toLowerCase();
  const shown =
    catalogue === null
      ? []
      : needle === ''
        ? catalogue
        : catalogue.filter(
            (m) =>
              m.name.toLowerCase().includes(needle) ||
              m.id.toLowerCase().includes(needle),
          );

  return (
    <Card title="Companion model">
      <p>All companions use this model. You pay for every reply it writes.</p>

      {onOpenRouter ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-foreground truncate">
                {detail?.name ?? settings.model}
              </p>
              <p className="text-muted-foreground truncate font-mono text-sm">
                {settings.model}
              </p>
            </div>
            <Button
              onClick={openPicker}
              className={`${CONTROL_BUTTON} shrink-0`}
            >
              <Cpu className="mr-1.5 inline size-4" />
              Change
            </Button>
          </div>

          {detail === null && (
            <p className="text-destructive text-sm">
              OpenRouter doesn&apos;t know this model.
            </p>
          )}
          {spans !== null && (
            <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 text-sm tabular-nums">
              <dt>Context</dt>
              <dd>{spread(spans.contextLength, tokens)} tokens</dd>
              <dt>Price</dt>
              <dd>
                {spread(spans.promptPrice, money)} in /{' '}
                {spread(spans.completionPrice, money)} out, per million tokens
              </dd>
              {spans.latencyMs !== null && spans.tps !== null && (
                <>
                  <dt>Speed</dt>
                  <dd>
                    {spread(spans.latencyMs, seconds)} to first token,{' '}
                    {spread(spans.tps, (n) => String(Math.round(n)))} tok/s
                  </dd>
                </>
              )}
              {/* Unpinned, OpenRouter chooses at request time: there is no name
                  to give, so the count says how many the figures span. */}
              <dt>Endpoints</dt>
              <dd>
                {pinned === '' ? (
                  `any of ${spans.providers}`
                ) : (
                  <>
                    {reachable[0]?.provider}{' '}
                    <span className="font-mono">{pinned}</span>
                  </>
                )}
              </dd>
            </dl>
          )}
          {detail !== null && detail !== undefined && spans === null && (
            <p className="text-destructive text-sm">
              {pinned === ''
                ? 'OpenRouter lists no providers for this model.'
                : `No provider ${pinned} serves this model any more. Pick another below.`}
            </p>
          )}
          {key === '' && (
            <p className="text-muted-foreground text-sm">
              Add your OpenRouter key above to see cost and speed.
            </p>
          )}
          {/* Everything this card can't show — what the model is for, who
              serves it, what it refuses — is on its OpenRouter page. */}
          <a
            href={`https://openrouter.ai/${settings.model}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground text-sm underline underline-offset-2 hover:no-underline"
          >
            Read about this model on OpenRouter
          </a>

          {picking && (
            <div className={`rounded-lg border ${CONTROL_BORDER} p-2`}>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter models"
                spellCheck={false}
                autoComplete="off"
                className={`${CONTROL_INPUT} mb-2 w-full`}
              />
              {catalogue === null ? (
                <p className="text-muted-foreground p-2 text-sm">
                  Loading the catalogue…
                </p>
              ) : (
                <ul className="max-h-64 overflow-y-auto">
                  {shown.map((m) => (
                    <li key={m.id}>
                      <Button
                        onClick={() => choose(m)}
                        className="hover:bg-secondary/50 w-full rounded-md px-2 py-1.5 text-left"
                      >
                        <span className="text-foreground block truncate">
                          {m.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-sm tabular-nums">
                          {money(m.promptPrice)} / {money(m.completionPrice)} ·{' '}
                          {tokens(m.contextLength)}
                          {m.hasReasoning ? ' · thinks before answering' : ''}
                        </span>
                      </Button>
                    </li>
                  ))}
                  {shown.length === 0 && (
                    <li className="text-muted-foreground p-2 text-sm">
                      Nothing matches. The list only holds models that can call
                      tools, which a companion needs to work the toy.
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="mt-2">
            <p className="text-foreground">Provider</p>
            <p className="text-muted-foreground mb-2 text-sm">
              Several providers serve the same model, at their own price and
              context length. {ROUTING_BLURB[settings.routing]}
            </p>
            <Segmented
              options={ROUTING_OPTIONS}
              value={settings.routing}
              onChange={(routing) =>
                save({
                  ...settings,
                  routing,
                  // Held, it would reapply itself the next time 'provider' was
                  // chosen (model-settings.ts).
                  provider: routing === 'provider' ? settings.provider : '',
                })
              }
              disabled={false}
            />
          </div>

          {settings.routing === 'provider' && (
            <div className={`rounded-lg border ${CONTROL_BORDER} p-2`}>
              {detail == null ? (
                <p className="text-muted-foreground p-2 text-sm">
                  {key === ''
                    ? 'Add your OpenRouter key above to list the providers.'
                    : 'Loading the providers…'}
                </p>
              ) : (
                <ul>
                  {/* Pinned with nobody named routes exactly as Normal does
                      (model-settings.ts sends no provider field), so the card
                      has to say so rather than let the segment imply a pin. */}
                  {settings.provider === '' && (
                    <li className="text-muted-foreground p-2 text-sm">
                      Nothing pinned yet — until you choose one, this routes the
                      normal way.
                    </li>
                  )}
                  {detail.endpoints.map((e) => (
                    <li key={e.tag}>
                      <Button
                        onClick={() => save({ ...settings, provider: e.tag })}
                        // Unselected is transparent, as in Segmented: the
                        // button's own fill is close enough to the selected one
                        // that a list of them reads as all-selected.
                        className={`w-full rounded-md px-2 py-1.5 text-left ${
                          e.tag === settings.provider
                            ? 'bg-secondary text-secondary-foreground'
                            : 'hover:bg-secondary/50 bg-transparent'
                        }`}
                      >
                        {/* The tag, not just the name: one provider often
                            serves the same model several ways — a priority
                            tier, a zero-retention region — under one name and
                            at different prices, and the tag is the only thing
                            that tells them apart or pins one of them. */}
                        <span className="text-foreground block truncate">
                          {e.provider}{' '}
                          <span className="text-muted-foreground font-mono text-sm">
                            {e.tag}
                          </span>
                        </span>
                        <span className="text-muted-foreground block text-sm tabular-nums">
                          {endpointLine(e)}
                        </span>
                      </Button>
                    </li>
                  ))}
                  {detail.endpoints.length === 0 && (
                    <li className="text-muted-foreground p-2 text-sm">
                      OpenRouter lists no providers for this model.
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <label className="flex flex-col gap-1">
          Model slug
          <input
            type="text"
            value={settings.model}
            onChange={(e) => save({ ...settings, model: e.target.value })}
            spellCheck={false}
            autoComplete="off"
            className={CONTROL_INPUT}
          />
          <span className="text-muted-foreground text-sm">
            Your chat endpoint isn&apos;t OpenRouter, so there is no list to
            pick from, and no provider routing either. Type the name the
            endpoint knows this model by.
          </span>
        </label>
      )}

      {failure !== null && (
        <p className="text-destructive text-sm">{failure}</p>
      )}

      <div className="mt-2">
        <p className="text-foreground">Streaming</p>
        <p className="text-muted-foreground mb-2 text-sm">
          Spoken replies sound the same either way — this only changes the
          transcript. Choose all at once if the companion says its own thinking
          out loud.
        </p>
        <Segmented
          options={STREAM_OPTIONS}
          value={settings.stream ? 'stream' : 'whole'}
          onChange={(next) => save({ ...settings, stream: next === 'stream' })}
          disabled={false}
        />
      </div>

      <div className="mt-2">
        <p className="text-foreground">Reasoning</p>
        {/* Advertising `reasoning` says the model returns its thinking. It does
            not say the model was trained to read that thinking replayed to it,
            and OpenRouter publishes nothing that does — so the copy points at
            the model's own page rather than recommending a setting. */}
        <p className="text-muted-foreground mb-2 text-sm">
          {reasons === false
            ? 'This model returns no reasoning, so there is nothing to send.'
            : 'Sends the reasoning a model returned back with the next request, as part of the conversation. Few models are trained to read it; the rest answer no better for it and charge for the tokens anyway. Read this model’s OpenRouter page, linked above, before turning it on.'}
        </p>
        <Segmented
          options={REASONING_OPTIONS}
          value={settings.passesReasoning ? 'pass' : 'drop'}
          onChange={(next) =>
            save({ ...settings, passesReasoning: next === 'pass' })
          }
          // Nothing to send, so the switch would claim something untrue.
          disabled={reasons === false}
        />
      </div>
    </Card>
  );
}
