// Choosing the model every companion runs on, by what it costs and how fast it
// answers rather than by pasting a slug.
//
// The catalogue is ~650 KB, so it is fetched when the picker is opened and not
// before; the chosen model's own detail is ~4 KB and is fetched whenever the
// choice changes. Latency needs the OpenRouter key, so a browser with no key
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
  OPENROUTER_API,
  fetchCatalogue,
  fetchModelDetail,
  pricePerMillion,
} from '@/lib/companions/model-catalogue';
import { catalogueId } from '@/lib/companions/model-settings';
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
  // OpenAI-compatible endpoint, the picker has nothing to offer and the slug is
  // typed instead.
  const onOpenRouter = apiKeys.keys.llmUrl.startsWith(OPENROUTER_API);

  // What the chosen model is and does. Re-run on every change of choice, so the
  // line under the name always describes what is actually selected.
  useEffect(() => {
    if (!checked || key === '' || !onOpenRouter) return;
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
      model: model.id,
      stream: settings.stream,
      // A model that doesn't reason has no reasoning to pass back, so the
      // switch goes off with the choice rather than sitting on and doing
      // nothing.
      passesReasoning: model.hasReasoning && settings.passesReasoning,
    });
    setPicking(false);
    setFilter('');
  };

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
          {detail != null && (
            <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 text-sm tabular-nums">
              <dt>Context</dt>
              <dd>{tokens(detail.contextLength)} tokens</dd>
              <dt>Price</dt>
              <dd>
                {money(detail.promptPrice)} in / {money(detail.completionPrice)}{' '}
                out, per million tokens
              </dd>
              {detail.speed !== null && (
                <>
                  <dt>Speed</dt>
                  <dd>
                    {seconds(detail.speed.latencyMs)} to first token,{' '}
                    {Math.round(detail.speed.tps)} tok/s (
                    {detail.speed.provider})
                  </dd>
                </>
              )}
            </dl>
          )}
          {key === '' && (
            <p className="text-muted-foreground text-sm">
              Add your OpenRouter key above to see cost and speed.
            </p>
          )}
          {/* Everything this card can't show — what the model is for, who
              serves it, what it refuses — is on its OpenRouter page. */}
          <a
            href={`https://openrouter.ai/${catalogueId(settings.model)}`}
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
                          {m.hasReasoning ? ' · reasons' : ''}
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
            pick from. Type the name the endpoint knows this model by.
          </span>
        </label>
      )}

      {failure !== null && (
        <p className="text-destructive text-sm">{failure}</p>
      )}

      <div className="mt-2">
        <p className="text-foreground">How the reply arrives</p>
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
        <p className="text-foreground">The model&apos;s own thinking</p>
        <p className="text-muted-foreground mb-2 text-sm">
          {detail?.hasReasoning === false
            ? "This model doesn't think before it answers, so there is nothing to send."
            : 'Models that think before answering can be sent that thinking back with the conversation. It helps them keep the thread, and makes every reply cost a little more. Try it on if a companion starts contradicting themselves.'}
        </p>
        <Segmented
          options={REASONING_OPTIONS}
          value={settings.passesReasoning ? 'pass' : 'drop'}
          onChange={(next) =>
            save({ ...settings, passesReasoning: next === 'pass' })
          }
          // Nothing to send, so the switch would claim something untrue.
          disabled={detail?.hasReasoning === false}
        />
      </div>
    </Card>
  );
}
