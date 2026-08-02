// The parameters an experiment ran under, and the rule that keeps one hoisted
// copy of them honest.

import { describe, expect, it } from '@jest/globals';
import {
  checkParameters,
  parseParameters,
  parseRunFields,
  renderParameters,
  renderRunFields,
  RunError,
  RunRefused,
  type RunParameters,
} from './runs';

const PARAMETERS: RunParameters = {
  model: 'qwen/qwen3-vl-235b-a22b-instruct',
  maxEdge: 1024,
  temperature: 0,
};

describe('parseParameters', () => {
  it('round-trips through renderParameters', () => {
    expect(parseParameters(renderParameters(PARAMETERS))).toEqual(PARAMETERS);
  });

  it('refuses a file with no model', () => {
    expect(() => parseParameters('{"maxEdge":1024,"temperature":0}')).toThrow(
      RunError,
    );
  });

  it('refuses a maxEdge that is not a number', () => {
    expect(() =>
      parseParameters('{"model":"m","maxEdge":"1024","temperature":0}'),
    ).toThrow(RunError);
  });

  it('accepts a temperature of zero rather than reading it as absent', () => {
    expect(
      parseParameters('{"model":"m","maxEdge":1024,"temperature":0}')
        .temperature,
    ).toBe(0);
  });
});

describe('parseRunFields', () => {
  it('round-trips through renderRunFields', () => {
    const run = {
      ranAt: '2026-08-02T14:22:31.004Z',
      commit: 'ef88374',
      fields: { naked: true, breastSize: 'medium' },
    };
    expect(parseRunFields(renderRunFields(run))).toEqual(run);
  });

  it('refuses a record with no fields', () => {
    expect(() => parseRunFields('{"ranAt":"now","commit":"abc"}')).toThrow(
      RunError,
    );
  });

  it('refuses a field holding something that is not a value', () => {
    expect(() =>
      parseRunFields(
        '{"ranAt":"now","commit":"abc","fields":{"naked":{"value":true}}}',
      ),
    ).toThrow(RunError);
  });
});

describe('checkParameters', () => {
  it('passes when the parameters are the ones already recorded', () => {
    expect(() => checkParameters(PARAMETERS, { ...PARAMETERS })).not.toThrow();
  });

  it('refuses a different model', () => {
    expect(() =>
      checkParameters(PARAMETERS, { ...PARAMETERS, model: 'other' }),
    ).toThrow(RunRefused);
  });

  it('refuses a different resolution', () => {
    expect(() =>
      checkParameters(PARAMETERS, { ...PARAMETERS, maxEdge: 2048 }),
    ).toThrow(RunRefused);
  });

  it('names both values of what moved, so the fix is obvious', () => {
    expect(() =>
      checkParameters(PARAMETERS, { ...PARAMETERS, maxEdge: 2048 }),
    ).toThrow(/maxEdge 1024 → 2048/);
  });
});
