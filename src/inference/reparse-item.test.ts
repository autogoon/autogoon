// What a reparse leaves behind. Reading the reply and writing the two files is
// corpus.ts's; what is decided here is that re-deriving answers doesn't claim
// the model produced them under code it never saw.

import { describe, expect, it } from '@jest/globals';
import { reparsedRecord } from './reparse-item';
import type { RunFields } from './runs';

const RECORD: RunFields = {
  ranAt: '2026-08-02T14:22:31.004Z',
  version: '00b3ee91c4d7',
  parameters: { model: 'a-model', maxEdge: 1024, temperature: 0 },
  fields: { naked: true },
};

describe('reparsedRecord', () => {
  it('takes the fields read this time', () => {
    expect(reparsedRecord(RECORD, { naked: false }).fields).toEqual({
      naked: false,
    });
  });

  it("keeps the version that produced the reply, which a reparse hasn't changed", () => {
    expect(reparsedRecord(RECORD, {}).version).toBe(RECORD.version);
  });

  it('keeps when the run happened, since nothing ran now', () => {
    expect(reparsedRecord(RECORD, {}).ranAt).toBe(RECORD.ranAt);
  });

  it('keeps what that run asked the model for', () => {
    expect(reparsedRecord(RECORD, {}).parameters).toEqual(RECORD.parameters);
  });
});
