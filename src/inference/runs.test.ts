// The record an experiment writes per item, and whether it still describes the
// experiment as it stands.

import { describe, expect, it } from '@jest/globals';
import {
  isCurrent,
  parseRunFields,
  renderRunFields,
  RunError,
  type RunParameters,
} from './runs';

const PARAMETERS: RunParameters = {
  model: 'qwen/qwen3-vl-235b-a22b-instruct',
  maxEdge: 1024,
  temperature: 0,
};

const RECORD = `{"ranAt":"now","parameters":${JSON.stringify(PARAMETERS)},"fields":{"naked":true}}`;

describe('parseRunFields', () => {
  it('round-trips through renderRunFields', () => {
    const run = {
      ranAt: '2026-08-02T14:22:31.004Z',
      version: 'a41f0c2b7d9e',
      parameters: PARAMETERS,
      fields: { naked: true, breastSize: 'medium' },
    };
    expect(parseRunFields(renderRunFields(run))).toEqual(run);
  });

  it('reads a record written before versions were stamped', () => {
    expect(parseRunFields(RECORD)).not.toHaveProperty('version');
  });

  it('reads back what the run asked the model for', () => {
    expect(parseRunFields(RECORD).parameters).toEqual(PARAMETERS);
  });

  it('refuses a record with no fields', () => {
    expect(() =>
      parseRunFields(
        `{"ranAt":"now","parameters":${JSON.stringify(PARAMETERS)}}`,
      ),
    ).toThrow(RunError);
  });

  it('refuses a field holding something that is not a value', () => {
    expect(() =>
      parseRunFields(
        `{"ranAt":"now","parameters":${JSON.stringify(PARAMETERS)},"fields":{"naked":{"value":true}}}`,
      ),
    ).toThrow(RunError);
  });

  it('refuses a record that says nothing about what produced it', () => {
    expect(() =>
      parseRunFields('{"ranAt":"now","fields":{"naked":true}}'),
    ).toThrow(RunError);
  });

  it('reads the second model where an experiment split looking from reading', () => {
    const split = JSON.stringify({ ...PARAMETERS, textModel: 'a-text-model' });
    expect(
      parseRunFields(
        `{"ranAt":"now","parameters":${split},"fields":{"naked":true}}`,
      ).parameters.textModel,
    ).toBe('a-text-model');
  });

  it('reads a record from an experiment that used one model for both', () => {
    expect(parseRunFields(RECORD).parameters).not.toHaveProperty('textModel');
  });

  it('refuses parameters naming no model, since a version cannot be read back into one', () => {
    expect(() =>
      parseRunFields(
        '{"ranAt":"now","parameters":{"maxEdge":1024,"temperature":0},"fields":{"naked":true}}',
      ),
    ).toThrow(RunError);
  });
});

describe('isCurrent', () => {
  const run = { ranAt: 'now', parameters: PARAMETERS, fields: { naked: true } };

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
