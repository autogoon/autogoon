// The baseline's parser, against replies of the shape its prompt asks for, and
// the substitution that carries the first call's reply into the second call's
// prompt. `run` is not exercised here: it sends two paid requests, and a canned
// completion would prove nothing about either.

import { describe, expect, it } from '@jest/globals';
import { parse, secondPrompt } from './index';
import { PROMPT_TWO } from './prompt';

const REPLY = `OBSERVATIONS:
Support: her shins and knees.
Clothing: nothing.

NAKED: true

CAPTION: Kneeling on a bed in warm light, naked, dark hair loose over one shoulder.`;

describe('parse', () => {
  it('reads the naked flag out of a reply in the prompt’s format', () => {
    expect(parse(REPLY).fields).toEqual({ naked: true });
  });

  it('reads false as false rather than as an absent answer', () => {
    expect(parse(REPLY.replace('NAKED: true', 'NAKED: false')).fields).toEqual({
      naked: false,
    });
  });

  it('takes the last flag, so an echoed format template loses', () => {
    const reply = `OBSERVATIONS:\nOn a beach.\n\nNAKED: <true or false>\nNAKED: false\n\nCAPTION: On a beach.`;
    expect(parse(reply).fields).toEqual({ naked: false });
  });

  it('reads the flag whatever case the model wrote it in', () => {
    expect(
      parse('On a beach.\n\nnaked: TRUE\n\nCAPTION: On a beach.').fields,
    ).toEqual({ naked: true });
  });

  it('answers no field when the reply carries no flag', () => {
    expect(
      parse('OBSERVATIONS:\nShe is on a beach.\n\nCAPTION: On a beach.').fields,
    ).toEqual({});
  });

  it('answers no field when the flag is a word it cannot read', () => {
    expect(
      parse(
        'OBSERVATIONS:\nOn a beach.\n\nNAKED: partly\n\nCAPTION: On a beach.',
      ).fields,
    ).toEqual({});
  });

  it('takes the caption line as the caption a pack would play', () => {
    expect(parse(REPLY).sidecar.caption).toBe(
      'Kneeling on a bed in warm light, naked, dark hair loose over one shoulder.',
    );
  });

  it('takes the observations as the description, without their label', () => {
    expect(parse(REPLY).sidecar.description).toBe(
      'Support: her shins and knees.\nClothing: nothing.',
    );
  });

  it('takes the last caption, so an echoed format template loses', () => {
    const reply = `${REPLY}\nCAPTION: On a bed.`;
    expect(parse(reply).sidecar.caption).toBe('On a bed.');
  });

  it('strips the quotes a model sometimes wraps the caption in', () => {
    const reply = REPLY.replace(
      'CAPTION: Kneeling',
      'CAPTION: "Kneeling',
    ).replace('one shoulder.', 'one shoulder."');
    expect(parse(reply).sidecar.caption.startsWith('Kneeling')).toBe(true);
  });

  it('refuses a reply carrying no caption, which no pack could play', () => {
    expect(() => parse('OBSERVATIONS:\nOn a beach.\n\nNAKED: true')).toThrow();
  });

  it('refuses a reply carrying a caption and nothing it was read from', () => {
    expect(() => parse('CAPTION: On a beach.')).toThrow();
  });
});

describe('secondPrompt', () => {
  it("carries the first call's reply into the prompt, since the second sees no picture", () => {
    expect(secondPrompt('She is kneeling on a bed.')).toContain(
      'She is kneeling on a bed.',
    );
  });

  it('leaves no placeholder behind for the model to read as an instruction', () => {
    expect(secondPrompt('On a beach.')).not.toContain('{{DESCRIPTION}}');
  });

  it('keeps the rest of the prompt as written', () => {
    const [before] = PROMPT_TWO.split('{{DESCRIPTION}}');
    expect(secondPrompt('On a beach.').startsWith(before!)).toBe(true);
  });
});
