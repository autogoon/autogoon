// The model settings store, and the routing suffixes that aren't part of a
// model's name.
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  DEFAULT_MODEL,
  catalogueId,
  readModelSettings,
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

describe('catalogueId', () => {
  it('strips a routing suffix, which is not part of any model id', () => {
    expect(catalogueId('nex-agi/nex-n2-mini:nitro')).toBe(
      'nex-agi/nex-n2-mini',
    );
    expect(catalogueId('some/model:floor')).toBe('some/model');
  });

  it('keeps a suffix that names a real model', () => {
    // :free, :batch and :thinking are ids in their own right.
    expect(catalogueId('liquid/lfm-2.5-2.6b:free')).toBe(
      'liquid/lfm-2.5-2.6b:free',
    );
    expect(catalogueId('x-ai/grok-4.6')).toBe('x-ai/grok-4.6');
  });
});

describe('model settings', () => {
  beforeEach(() => {
    for (const name of Object.keys(store)) delete store[name];
  });

  it('streams by default, and passes no reasoning', () => {
    expect(readModelSettings()).toEqual({
      model: DEFAULT_MODEL,
      stream: true,
      passesReasoning: false,
    });
  });

  it('round-trips both switches, including the off state', () => {
    const settings = {
      model: 'some/model',
      stream: false,
      passesReasoning: true,
    };
    writeModelSettings(settings);
    expect(readModelSettings()).toEqual(settings);
  });
});
