// The key store: what a browser with nothing saved reports, what survives a
// write, and the availability rule Companions hangs off.
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  DEFAULT_LLM_URL,
  clearKeys,
  hasKeys,
  readKeys,
  writeKeys,
} from './keys';

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

describe('keys', () => {
  beforeEach(() => {
    for (const name of Object.keys(store)) delete store[name];
  });

  it('reports no keys and the default endpoint when nothing is stored', () => {
    expect(readKeys()).toEqual({
      openRouterKey: '',
      elevenLabsKey: '',
      llmUrl: DEFAULT_LLM_URL,
    });
  });

  it('round-trips all three, and forgets all three', () => {
    const keys = {
      openRouterKey: 'sk-or-1',
      elevenLabsKey: 'sk_el-1',
      llmUrl: 'https://elsewhere.test/v1',
    };
    writeKeys(keys);
    expect(readKeys()).toEqual(keys);
    clearKeys();
    expect(readKeys().openRouterKey).toBe('');
    expect(readKeys().elevenLabsKey).toBe('');
    expect(readKeys().llmUrl).toBe(DEFAULT_LLM_URL);
  });

  it('needs both keys: one alone runs nothing', () => {
    expect(hasKeys({ openRouterKey: 'a', elevenLabsKey: '', llmUrl: '' })).toBe(
      false,
    );
    expect(hasKeys({ openRouterKey: '', elevenLabsKey: 'b', llmUrl: '' })).toBe(
      false,
    );
    expect(
      hasKeys({ openRouterKey: 'a', elevenLabsKey: 'b', llmUrl: '' }),
    ).toBe(true);
  });
});
