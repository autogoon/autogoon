// The baseline's parser, against replies of the shape its prompt asks for.
// `run` is not exercised here: it sends a paid request, and a canned completion
// would prove nothing about it.

import { describe, expect, it } from '@jest/globals';
import { parse } from './index';

const REPLY = `OBSERVATIONS:
Support: her shins and knees.
Clothing: nothing.

NAKED: true

CAPTION: Kneeling on a bed in warm light, naked, dark hair loose over one shoulder.`;

describe('parse', () => {
  it('reads the naked flag out of a reply in the prompt’s format', () => {
    expect(parse(REPLY)).toEqual({ naked: true });
  });

  it('reads false as false rather than as an absent answer', () => {
    expect(parse(REPLY.replace('NAKED: true', 'NAKED: false'))).toEqual({
      naked: false,
    });
  });

  it('takes the last line, so an echoed format template loses', () => {
    expect(parse(`NAKED: <true or false>\nNAKED: false\n\nCAPTION: …`)).toEqual(
      { naked: false },
    );
  });

  it('reads the flag whatever case the model wrote it in', () => {
    expect(parse('naked: TRUE')).toEqual({ naked: true });
  });

  it('answers nothing when the reply carries no flag', () => {
    expect(parse('OBSERVATIONS:\nShe is on a beach.\n\nCAPTION: …')).toEqual(
      {},
    );
  });

  it('answers nothing when the flag is a word it cannot read', () => {
    expect(parse('NAKED: partly')).toEqual({});
  });
});
