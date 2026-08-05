// The baseline's parser, against replies of the shape its prompt asks for, and
// the substitution that carries the first call's reply into the second call's
// prompt. `run` is not exercised here: it sends two paid requests, and a canned
// completion would prove nothing about either.

import { describe, expect, it } from '@jest/globals';
import { FIELDS } from '../../fields';
import { parse, secondPrompt } from './index';
import { PROMPT_TWO } from './prompt';

const REPLY = `REASONING:
Support: her shins and knees.
Clothing: nothing.

HAIR: dark, loose over one shoulder
GAZE: straight at the camera, mouth slightly open
SETTING: a bed, warm side light from the left
BODY SHAPE: slim, long-limbed
CLOTHING: none
EXPOSED: back fully, thighs fully, buttocks partly
NAKED: Yes
BREAST SIZE: Medium
WEARING BRA: No
WEARING PANTIES: No
TOPLESS: Yes
NIPPLE VISIBILITY: Bare and visible
GENITAL VISIBILITY: Not visible
TEXT: HOTEL CALIFORNIA

CAPTION: Kneeling on a bed in warm light, naked, dark hair loose over one shoulder.`;

describe('parse', () => {
  it('reads every field out of a reply in the prompt’s format', () => {
    expect(parse(REPLY).fields).toMatchObject({
      hair: 'dark, loose over one shoulder',
      gaze: 'straight at the camera, mouth slightly open',
      setting: 'a bed, warm side light from the left',
      bodyShape: 'slim, long-limbed',
      clothing: 'none',
      exposed: 'back fully, thighs fully, buttocks partly',
      naked: true,
      breastSize: 'medium',
      wearingBra: false,
      wearingPanties: false,
      topless: true,
      nippleVisibility: 'bare',
      genitalVisibility: 'notVisible',
    });
  });

  it('answers every field the field set asks about and nothing else', () => {
    expect(Object.keys(parse(REPLY).fields).sort()).toEqual(
      FIELDS.map((f) => f.id).sort(),
    );
  });

  it('reads the caption and the prose above the answers as the two a pack plays', () => {
    const { fields, sidecar } = parse(REPLY);
    expect(fields.caption).toBe(sidecar.caption);
    expect(fields.description).toBe(sidecar.description);
  });

  it('keeps words on the picture apart from the caption that describes it', () => {
    const { fields } = parse(REPLY);
    expect(fields.text).toBe('HOTEL CALIFORNIA');
    expect(fields.caption).not.toContain('HOTEL CALIFORNIA');
  });

  it('leaves text absent where the model answered None, which is no text', () => {
    expect(
      parse(REPLY.replace('TEXT: HOTEL CALIFORNIA', 'TEXT: None')).fields,
    ).not.toHaveProperty('text');
  });

  it('stores none as the clothing of a naked subject, which is an answer', () => {
    expect(parse(REPLY).fields).toMatchObject({ clothing: 'none' });
  });

  it('keeps a text field’s line as written, since no word list covers it', () => {
    const reply = REPLY.replace(
      'HAIR: dark, loose over one shoulder',
      'HAIR: Bleached blonde, in a high pony',
    );
    expect(parse(reply).fields).toMatchObject({
      hair: 'Bleached blonde, in a high pony',
    });
  });

  it('leaves a text field absent where the reply only echoed the template', () => {
    expect(
      parse(
        REPLY.replace(
          'HAIR: dark, loose over one shoulder',
          'HAIR: <colour and what it is doing>',
        ),
      ).fields,
    ).not.toHaveProperty('hair');
  });

  it('reads No as false rather than as an absent answer', () => {
    expect(
      parse(REPLY.replace('NAKED: Yes', 'NAKED: No')).fields,
    ).toMatchObject({ naked: false });
  });

  it('reads Unknown as an answer, since a picture that cannot be read is one', () => {
    expect(
      parse(REPLY.replace('NAKED: Yes', 'NAKED: Unknown')).fields,
    ).toMatchObject({ naked: 'unknown' });
  });

  it('reads a two-word size as the value the field set stores', () => {
    expect(
      parse(REPLY.replace('BREAST SIZE: Medium', 'BREAST SIZE: Very large'))
        .fields,
    ).toMatchObject({ breastSize: 'veryLarge' });
  });

  it('reads an answer whatever case the model wrote it in', () => {
    expect(
      parse(REPLY.replace('BREAST SIZE: Medium', 'breast size: VERY LARGE'))
        .fields,
    ).toMatchObject({ breastSize: 'veryLarge' });
  });

  it('reads an answer the model ended with a full stop', () => {
    expect(
      parse(REPLY.replace('NAKED: Yes', 'NAKED: Yes.')).fields,
    ).toMatchObject({ naked: true });
  });

  it('takes the last answer it can read, so an echoed format template loses', () => {
    const reply = REPLY.replace(
      'NAKED: Yes',
      'NAKED: Yes, No or Unknown\nNAKED: No',
    );
    expect(parse(reply).fields).toMatchObject({ naked: false });
  });

  it('keeps an earlier readable answer over a later line it cannot read', () => {
    const reply = REPLY.replace('NAKED: Yes', 'NAKED: Yes\nNAKED: partly');
    expect(parse(reply).fields).toMatchObject({ naked: true });
  });

  it('answers only the caption and description where the reply marks nothing else', () => {
    expect(
      Object.keys(
        parse('OBSERVATIONS:\nShe is on a beach.\n\nCAPTION: On a beach.')
          .fields,
      ).sort(),
    ).toEqual(['caption', 'description']);
  });

  it('answers no field when the answer is a word it cannot read', () => {
    expect(
      parse(
        'OBSERVATIONS:\nOn a beach.\n\nNAKED: partly\n\nCAPTION: On a beach.',
      ).fields,
    ).not.toHaveProperty('naked');
  });

  it('answers the fields it could read and leaves out the ones it could not', () => {
    expect(
      parse(REPLY.replace('BREAST SIZE: Medium', 'BREAST SIZE: enormous'))
        .fields,
    ).not.toHaveProperty('breastSize');
  });

  it('ignores a marked line the field set has nowhere to put', () => {
    const reply = REPLY.replace('NAKED: Yes', 'SHOE SIZE: 6\nNAKED: Yes');
    expect(Object.keys(parse(reply).fields)).not.toContain('shoeSize');
  });

  it('takes the caption line as the caption a pack would play', () => {
    expect(parse(REPLY).sidecar.caption).toBe(
      'Kneeling on a bed in warm light, naked, dark hair loose over one shoulder.',
    );
  });

  it('takes everything above the short answers as the description', () => {
    const description = parse(REPLY).sidecar.description;
    expect(description.startsWith('Support: her shins and knees.')).toBe(true);
    expect(description).toContain('SETTING: a bed, warm side light');
    expect(description).not.toContain('NAKED:');
  });

  it('drops the heading the prose opens with, whatever it is called', () => {
    const reply = REPLY.replace('REASONING:', 'OBSERVATIONS:  ');
    expect(parse(reply).sidecar.description.startsWith('Support:')).toBe(true);
  });

  it('reads a choice off the front of a line the model justified', () => {
    const reply = REPLY.replace(
      'NAKED: Yes',
      'NAKED: No — she is wearing a bralette and thong',
    ).replace(
      'BREAST SIZE: Medium',
      'BREAST SIZE: Very large — the cups are full',
    );
    expect(parse(reply).fields).toMatchObject({
      naked: false,
      breastSize: 'veryLarge',
    });
  });

  it('does not read a longer word as the short one it starts with', () => {
    expect(
      parse(REPLY.replace('NAKED: Yes', 'NAKED: nothing can be seen')).fields,
    ).not.toHaveProperty('naked');
  });

  it('takes the last caption, so an echoed format template loses', () => {
    const reply = `${REPLY}\nCAPTION: On a bed.`;
    expect(parse(reply).sidecar.caption).toBe('On a bed.');
  });

  it('drops a caption clause naming what is absent, which a search would index', () => {
    const reply = REPLY.replace(
      'CAPTION: Kneeling on a bed in warm light, naked, dark hair loose over one shoulder.',
      'CAPTION: orange thong, no visible breasts, nipples not visible, indoor setting, genitals obscured by fabric, wearing nothing else',
    );
    expect(parse(reply).fields.caption).toBe('orange thong, indoor setting');
  });

  it('keeps a clause whose word merely contains one of the words it drops for', () => {
    const reply = REPLY.replace(
      'CAPTION: Kneeling',
      'CAPTION: knot of hair, notable tan line, Kneeling',
    );
    const caption = String(parse(reply).fields.caption);
    expect(caption).toContain('knot of hair');
    expect(caption).toContain('notable tan line');
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
