// Ground truth's writers and its reader. What matters here is that the file
// holds a person's answers and nothing else, so every entry in it is a decision
// somebody made.

import { describe, expect, it } from '@jest/globals';
import { answer, clear, LabelError, parseLabels, renderLabels } from './labels';

describe('parseLabels', () => {
  it('reads a record of answered fields', () => {
    expect(parseLabels('{"naked":true}')).toEqual({ naked: true });
  });

  it('reads a string value, which is what a graded field stores', () => {
    expect(parseLabels('{"breastSize":"unknown"}')).toEqual({
      breastSize: 'unknown',
    });
  });

  it('refuses a file that is not JSON', () => {
    expect(() => parseLabels('naked: true')).toThrow(LabelError);
  });

  it('refuses a file that is a list rather than a set of fields', () => {
    expect(() => parseLabels('[{"naked":true}]')).toThrow(LabelError);
  });

  it('refuses an answer wrapped in an object, which no field value is', () => {
    expect(() => parseLabels('{"naked":{"value":true}}')).toThrow(LabelError);
  });

  it('refuses a numeric answer, which no field offers', () => {
    expect(() => parseLabels('{"naked":1}')).toThrow(LabelError);
  });
});

describe('renderLabels', () => {
  it('round-trips through parseLabels', () => {
    const labels = { naked: true, breastSize: 'medium' };
    expect(parseLabels(renderLabels(labels))).toEqual(labels);
  });

  it('sorts the fields, so two records of the same answers read the same', () => {
    expect(renderLabels({ naked: true, breastSize: 'medium' })).toBe(
      renderLabels({ breastSize: 'medium', naked: true }),
    );
  });
});

describe('answer', () => {
  it('records the value against the field', () => {
    expect(answer({}, 'naked', true).naked).toBe(true);
  });

  it('replaces an answer already given, which is what changing your mind means', () => {
    expect(answer({ naked: true }, 'naked', false).naked).toBe(false);
  });

  it('leaves the fields it was not given alone', () => {
    expect(answer({ breastSize: 'medium' }, 'naked', true).breastSize).toBe(
      'medium',
    );
  });
});

describe('clear', () => {
  it('takes the field back to absent rather than answering it unknown', () => {
    expect(clear({ naked: true }, 'naked')).not.toHaveProperty('naked');
  });

  it('leaves the fields it was not given alone', () => {
    expect(clear({ naked: true, breastSize: 'large' }, 'naked')).toEqual({
      breastSize: 'large',
    });
  });
});
