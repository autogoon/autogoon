import { describe, it, expect } from '@jest/globals';
import { COMPANIONS } from './companions';

describe('Aimee', () => {
  const aimee = COMPANIONS['autogoon.aimee']!;

  it('has a voice id and the configured presentation', () => {
    expect(typeof aimee.voiceId).toBe('string');
    expect(aimee.voiceId.length).toBeGreaterThan(0);
    expect(aimee.gender).toBe('female');
    expect(aimee.name).toBe('Aimee');
  });
});

describe('Miley', () => {
  const miley = COMPANIONS['autogoon.miley']!;

  it('has a voice id and the configured presentation', () => {
    expect(typeof miley.voiceId).toBe('string');
    expect(miley.voiceId.length).toBeGreaterThan(0);
    expect(miley.gender).toBe('female');
    expect(miley.name).toBe('Miley');
  });
});

describe('COMPANIONS registry', () => {
  it('keys each companion by its own id', () => {
    for (const [id, companion] of Object.entries(COMPANIONS)) {
      expect(companion.id).toBe(id);
    }
  });
});
