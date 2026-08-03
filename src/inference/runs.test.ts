// The parameters an experiment's last run used, the record it writes per item,
// and whether that record still describes the experiment as it stands.

import { describe, expect, it } from '@jest/globals';
import {
  isCurrent,
  parseRunFields,
  renderParameters,
  renderRunFields,
  RunError,
  type RunParameters,
} from './runs';

const PARAMETERS: RunParameters = {
  model: 'qwen/qwen3-vl-235b-a22b-instruct',
  maxEdge: 1024,
  temperature: 0,
};

describe('renderParameters', () => {
  // Nothing parses this file back, so what it looks like on disk is the whole
  // contract — it exists to be read by whoever opens the corpus.
  it('writes the three values as a person reads them, one per line', () => {
    expect(renderParameters(PARAMETERS)).toBe(
      `{
  "model": "qwen/qwen3-vl-235b-a22b-instruct",
  "maxEdge": 1024,
  "temperature": 0
}
`,
    );
  });
});

describe('parseRunFields', () => {
  it('round-trips through renderRunFields', () => {
    const run = {
      ranAt: '2026-08-02T14:22:31.004Z',
      version: 'a41f0c2b7d9e',
      fields: { naked: true, breastSize: 'medium' },
    };
    expect(parseRunFields(renderRunFields(run))).toEqual(run);
  });

  it('reads a record written before versions were stamped', () => {
    expect(
      parseRunFields('{"ranAt":"now","fields":{"naked":true}}'),
    ).not.toHaveProperty('version');
  });

  it('refuses a record with no fields', () => {
    expect(() => parseRunFields('{"ranAt":"now"}')).toThrow(RunError);
  });

  it('refuses a field holding something that is not a value', () => {
    expect(() =>
      parseRunFields('{"ranAt":"now","fields":{"naked":{"value":true}}}'),
    ).toThrow(RunError);
  });
});

describe('isCurrent', () => {
  const run = { ranAt: 'now', fields: { naked: true } };

  it('is true where the run carries the version asked about', () => {
    expect(isCurrent({ ...run, version: 'a41f0c2b7d9e' }, 'a41f0c2b7d9e')).toBe(
      true,
    );
  });

  it('is false where the experiment was edited after the run', () => {
    expect(isCurrent({ ...run, version: 'a41f0c2b7d9e' }, '00b3ee91c4d7')).toBe(
      false,
    );
  });

  it('is false for a record stamped with no version at all', () => {
    expect(isCurrent(run, 'a41f0c2b7d9e')).toBe(false);
  });
});
