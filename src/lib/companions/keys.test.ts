// The key store: what a browser with nothing saved reports, what survives a
// write, and the availability rule Companions hangs off.
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  DEFAULT_LLM_URL,
  clearKeys,
  hasKeys,
  readKeys,
  setEnvKeys,
  usingEnvKeys,
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
    setEnvKeys(null);
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

  it('never writes the .env keys into this browser', () => {
    // The whole point of the .env path: the server's keys are used and not
    // kept. A browser that has never had a key pasted into it must still have
    // nothing in storage after running on .env keys.
    setEnvKeys({
      openRouterKey: 'env-or',
      elevenLabsKey: 'env-el',
      llmUrl: 'https://env.test/v1',
    });
    expect(readKeys().openRouterKey).toBe('env-or');
    expect(Object.keys(store)).toEqual([]);
  });

  it("uses the server's .env over anything stored, and stores nothing", () => {
    // It is one source or the other: a browser that had keys pasted into it
    // before a .env appeared must run on the .env, not on its own copy.
    writeKeys({
      openRouterKey: 'pasted-or',
      elevenLabsKey: 'pasted-el',
      llmUrl: 'https://pasted.test/v1',
    });
    const fromEnv = {
      openRouterKey: 'env-or',
      elevenLabsKey: 'env-el',
      llmUrl: 'https://env.test/v1',
    };
    setEnvKeys(fromEnv);
    expect(readKeys()).toEqual(fromEnv);
    expect(usingEnvKeys()).toBe(true);
    expect(store['companions:openrouter-key']).toBe('pasted-or');

    // Dropping back is what a build does: no route, no .env, storage again.
    setEnvKeys(null);
    expect(readKeys().openRouterKey).toBe('pasted-or');
    expect(usingEnvKeys()).toBe(false);
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
