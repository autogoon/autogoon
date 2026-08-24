// The model settings store, and what routing turns into on a request.
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_SETTINGS,
  type ModelSettings,
  readModelSettings,
  routingRequest,
  writeModelSettings,
} from './model-settings';

const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (name: string) => store[name] ?? null,
  setItem: (name: string, value: string) => {
    store[name] = value;
  },
  removeItem: (name: string) => {
    delete store[name];
  },
} as unknown as Storage;

const settings = (patch: Partial<ModelSettings>): ModelSettings => ({
  ...DEFAULT_MODEL_SETTINGS,
  model: 'some/model',
  ...patch,
});

describe('routingRequest', () => {
  it('sends the bare slug when OpenRouter is left to choose', () => {
    expect(routingRequest(settings({ routing: 'normal' }))).toEqual({
      model: 'some/model',
    });
  });

  it('names a sort as a slug suffix, which is what OpenRouter calls it', () => {
    expect(routingRequest(settings({ routing: 'nitro' })).model).toBe(
      'some/model:nitro',
    );
    expect(routingRequest(settings({ routing: 'floor' })).model).toBe(
      'some/model:floor',
    );
    expect(routingRequest(settings({ routing: 'exacto' })).model).toBe(
      'some/model:exacto',
    );
  });

  it('pins a provider on the request body, not on the slug', () => {
    // The slug stays clean: a provider is not a variant of the model, and
    // OpenRouter has no suffix for one.
    expect(
      routingRequest(settings({ routing: 'provider', provider: 'azure' })),
    ).toEqual({
      model: 'some/model',
      provider: { only: ['azure'], allow_fallbacks: false },
    });
  });

  it('sends no provider when the routing in force is not the pin', () => {
    // Settings clears the provider on leaving the pin, so this is the
    // hand-edited-storage case: a stale provider must not quietly narrow a
    // request that asked to be sorted.
    expect(
      routingRequest(settings({ routing: 'nitro', provider: 'azure' })),
    ).toEqual({ model: 'some/model:nitro' });
  });

  it('routes normally when a pin has no provider chosen yet', () => {
    // An empty allow-list is a request OpenRouter can route nowhere.
    expect(
      routingRequest(settings({ routing: 'provider', provider: '' })),
    ).toEqual({ model: 'some/model' });
  });
});

describe('model settings', () => {
  beforeEach(() => {
    for (const name of Object.keys(store)) delete store[name];
  });

  it('streams by default, routes normally, and passes no reasoning', () => {
    expect(readModelSettings()).toEqual({
      model: DEFAULT_MODEL,
      routing: 'normal',
      provider: '',
      stream: true,
      passesReasoning: false,
    });
  });

  it('round-trips everything, including the off state of both switches', () => {
    const saved = settings({
      routing: 'provider',
      provider: 'azure',
      stream: false,
      passesReasoning: true,
    });
    writeModelSettings(saved);
    expect(readModelSettings()).toEqual(saved);
  });

  it('falls back to normal routing for a value it does not know', () => {
    // A routing this version can't honour must not be guessed at: routing to
    // the wrong provider is worse than routing the ordinary way.
    writeModelSettings(settings({ routing: 'nitro' }));
    store['companions:routing'] = 'whatever-comes-next';
    expect(readModelSettings().routing).toBe('normal');
  });
});
