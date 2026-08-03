// The version an experiment's results are stamped with. What matters is that
// it moves for every change that could alter a reply and stays put for the ones
// that can't — a version that drifted on prose would put a whole sweep out of
// date for nothing, and one that missed an edited prompt would report results
// as current that aren't.

import { describe, expect, it } from '@jest/globals';
import { fingerprintOf, versions } from './fingerprint';

const PROMPT = { name: 'prompt.ts', bytes: 'export const PROMPT = `look`;' };
const INDEX = { name: 'index.ts', bytes: 'export const ID = "x";' };

describe('fingerprintOf', () => {
  it('gives the same version to the same files', () => {
    expect(fingerprintOf([INDEX, PROMPT])).toBe(fingerprintOf([INDEX, PROMPT]));
  });

  it('ignores the order the files arrived in', () => {
    expect(fingerprintOf([PROMPT, INDEX])).toBe(fingerprintOf([INDEX, PROMPT]));
  });

  it('moves when a file’s contents change', () => {
    expect(fingerprintOf([INDEX, { ...PROMPT, bytes: 'look again' }])).not.toBe(
      fingerprintOf([INDEX, PROMPT]),
    );
  });

  it('moves when a file is renamed, though every byte is where it was', () => {
    expect(fingerprintOf([INDEX, { ...PROMPT, name: 'ask.ts' }])).not.toBe(
      fingerprintOf([INDEX, PROMPT]),
    );
  });

  it('moves when a file is added', () => {
    expect(fingerprintOf([INDEX])).not.toBe(fingerprintOf([INDEX, PROMPT]));
  });
});

describe('versions', () => {
  it('counts a module, which decides what the model is sent', () => {
    expect(versions('prompt.ts')).toBe(true);
  });

  it('leaves out the README, which no model reads', () => {
    expect(versions('README.md')).toBe(false);
  });

  it('leaves out a test, which cannot change a reply', () => {
    expect(versions('index.test.ts')).toBe(false);
  });
});
