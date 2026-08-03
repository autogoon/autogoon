// Ground truth's two writers and its reader. What matters here is that a run
// can never overwrite a curated answer and a reviewer can always overwrite a
// run's — the property the whole corpus rests on.

import { describe, expect, it } from '@jest/globals';
import {
  answer,
  clear,
  fillAbsent,
  HUMAN,
  isConfirmed,
  LabelError,
  parseLabels,
  renderLabels,
} from './labels';

const BASELINE = '2026-08-02-baseline';

describe('parseLabels', () => {
  it('reads a record of answers with their sources', () => {
    expect(parseLabels('{"naked":{"value":true,"source":"human"}}')).toEqual({
      naked: { value: true, source: HUMAN },
    });
  });

  it('reads a string value, which is what a graded field stores', () => {
    expect(
      parseLabels('{"breastSize":{"value":"unknown","source":"human"}}'),
    ).toEqual({ breastSize: { value: 'unknown', source: HUMAN } });
  });

  it('refuses a file that is not JSON', () => {
    expect(() => parseLabels('naked: true')).toThrow(LabelError);
  });

  it('refuses a bare value with no source, rather than assuming one', () => {
    expect(() => parseLabels('{"naked":true}')).toThrow(LabelError);
  });

  it('refuses an answer whose source is missing', () => {
    expect(() => parseLabels('{"naked":{"value":true}}')).toThrow(LabelError);
  });

  it('refuses an answer whose value is missing', () => {
    expect(() => parseLabels('{"naked":{"source":"human"}}')).toThrow(
      LabelError,
    );
  });
});

describe('renderLabels', () => {
  it('round-trips through parseLabels', () => {
    const labels = {
      naked: { value: true, source: HUMAN },
      breastSize: { value: 'medium', source: BASELINE },
    };
    expect(parseLabels(renderLabels(labels))).toEqual(labels);
  });

  it('sorts the fields, so two records of the same answers read the same', () => {
    const one = renderLabels({
      naked: { value: true, source: HUMAN },
      breastSize: { value: 'medium', source: HUMAN },
    });
    const other = renderLabels({
      breastSize: { value: 'medium', source: HUMAN },
      naked: { value: true, source: HUMAN },
    });
    expect(one).toBe(other);
  });
});

describe('answer', () => {
  it('stamps the reviewer as the source', () => {
    expect(answer({}, 'naked', true).naked).toEqual({
      value: true,
      source: HUMAN,
    });
  });

  it("replaces an experiment's answer, which is what confirming means", () => {
    const seeded = { naked: { value: true, source: BASELINE } };
    expect(answer(seeded, 'naked', false).naked).toEqual({
      value: false,
      source: HUMAN,
    });
  });

  it('leaves the fields it was not given alone', () => {
    const existing = { breastSize: { value: 'medium', source: HUMAN } };
    expect(answer(existing, 'naked', true).breastSize).toEqual(
      existing.breastSize,
    );
  });
});

describe('clear', () => {
  it('takes the field back to absent rather than answering it unknown', () => {
    const cleared = clear({ naked: { value: true, source: HUMAN } }, 'naked');
    expect(cleared).not.toHaveProperty('naked');
  });

  it('leaves the fields it was not given alone', () => {
    expect(
      clear(
        {
          naked: { value: true, source: HUMAN },
          breastSize: { value: 'large', source: BASELINE },
        },
        'naked',
      ),
    ).toEqual({ breastSize: { value: 'large', source: BASELINE } });
  });
});

describe('fillAbsent', () => {
  it('fills a field nobody has answered, stamped with the experiment', () => {
    expect(fillAbsent({}, { naked: true }, BASELINE).naked).toEqual({
      value: true,
      source: BASELINE,
    });
  });

  it('leaves a curated answer untouched when it disagrees', () => {
    const curated = { naked: { value: false, source: HUMAN } };
    expect(fillAbsent(curated, { naked: true }, BASELINE).naked).toEqual({
      value: false,
      source: HUMAN,
    });
  });

  it("leaves an earlier experiment's answer untouched", () => {
    const seeded = { naked: { value: true, source: BASELINE } };
    expect(
      fillAbsent(seeded, { naked: false }, '2026-09-01-nudenet').naked,
    ).toEqual({ value: true, source: BASELINE });
  });

  it('back-fills only the field a later run added', () => {
    const curated = { naked: { value: false, source: HUMAN } };
    const filled = fillAbsent(
      curated,
      { naked: true, breastSize: 'large' },
      BASELINE,
    );
    expect(filled).toEqual({
      naked: { value: false, source: HUMAN },
      breastSize: { value: 'large', source: BASELINE },
    });
  });
});

describe('isConfirmed', () => {
  it('is true only for an answer a reviewer gave', () => {
    expect(isConfirmed({ value: true, source: HUMAN })).toBe(true);
    expect(isConfirmed({ value: true, source: BASELINE })).toBe(false);
  });
});
