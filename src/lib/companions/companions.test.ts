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

  // The prompt is the front of every request, so anything in it that changes
  // between turns moves the point where a cached prefix stops matching to the
  // very top — costing the whole conversation behind it, not just the prompt.
  // The live values ride a trailing system message instead (liveStateMessage).
  // {{MEDIA_SECTION}} is fine — it resolves once, when a companion is
  // assembled. Only the per-turn markers cost anything.
  it('builds prompts with nothing that changes between turns', () => {
    for (const companion of Object.values(COMPANIONS)) {
      expect(companion.systemPrompt).not.toContain('{{TOY_STATUS}}');
      expect(companion.systemPrompt).not.toContain('{{NOW}}');
      expect(companion.systemPrompt).not.toContain('TOY STATUS (trust this');
      expect(companion.systemPrompt).not.toContain('TIME (his local time');
    }
  });
});
