// What a failed provider call says to the user. The statuses that have an
// action attached are pinned, and so is the one thing that must never appear:
// the body of an auth failure, which quotes the key back.
import { describe, it, expect } from '@jest/globals';
import {
  elevenLabsMessage,
  llmErrorMessage,
  llmProvider,
  providerMessage,
} from './provider-error';

describe('providerMessage', () => {
  it('names the fix for a rejected key, and quotes nothing back', () => {
    const message = providerMessage(
      'OpenRouter',
      401,
      '{"error":{"message":"No auth credentials found: sk-or-secret"}}',
    );
    expect(message).toBe(
      'OpenRouter rejected your API key — check it in Settings.',
    );
    expect(message).not.toContain('sk-or-secret');
  });

  it('tells an empty balance apart from a rate limit', () => {
    expect(providerMessage('OpenRouter', 402, '')).toBe(
      'OpenRouter is out of credit.',
    );
    expect(providerMessage('ElevenLabs', 429, '')).toBe(
      'ElevenLabs is rate limiting — too many requests.',
    );
  });

  it("keeps the provider's own message for anything else", () => {
    // A bad model slug is only diagnosable from what the provider said.
    expect(
      providerMessage(
        'OpenRouter',
        400,
        '{"error":{"message":"not a valid model ID"}}',
      ),
    ).toBe('OpenRouter 400: not a valid model ID');
  });

  it("unwraps ElevenLabs' detail shape", () => {
    expect(
      elevenLabsMessage(
        422,
        '{"detail":{"message":"voice_id does not exist"}}',
      ),
    ).toBe('ElevenLabs 422: voice_id does not exist');
  });
});

describe('llmProvider', () => {
  it('names OpenRouter only when the endpoint is OpenRouter', () => {
    expect(llmProvider('https://openrouter.ai/api/v1')).toBe('OpenRouter');
    expect(llmProvider('http://localhost:1234/v1')).toBe('The LLM provider');
  });
});

describe('llmErrorMessage', () => {
  it('maps the status the SDK carries on its error', () => {
    const error = Object.assign(new Error('Payment Required'), { status: 402 });
    expect(llmErrorMessage(error, 'https://openrouter.ai/api/v1')).toBe(
      'OpenRouter is out of credit.',
    );
  });

  it('says unreachable when nothing answered, rather than quoting a status', () => {
    expect(
      llmErrorMessage(
        new Error('fetch failed'),
        'https://openrouter.ai/api/v1',
      ),
    ).toBe('OpenRouter unreachable: fetch failed');
  });
});
