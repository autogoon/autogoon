/**
 * @jest-environment jsdom
 */
// What the card claims about the endpoint a request will reach. Only a pin
// knows which provider answers, so the figures are a range and no provider is
// named unless one is pinned — the card must not turn OpenRouter's choice into
// a statement of fact. The shapes behind it are model-catalogue.test.ts's.
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ApiKeysState } from '@/hooks/use-api-keys';
import type { ModelSettingsState } from '@/hooks/use-model-settings';
import {
  DEFAULT_MODEL_SETTINGS,
  type ModelSettings,
} from '@/lib/companions/model-settings';
import { ModelCard } from './model-card';

// Two endpoints from one provider at different prices, which is the case the
// card exists to show: OpenRouter picks between them per request.
const ENDPOINTS = {
  data: {
    name: 'A Model',
    endpoints: [
      {
        provider_name: 'xAI',
        tag: 'xai',
        status: 0,
        context_length: 500_000,
        pricing: { prompt: '0.000002', completion: '0.000006' },
        supported_parameters: ['tools'],
        latency_last_30m: { p50: 1000 },
        throughput_last_30m: { p50: 50 },
      },
      {
        provider_name: 'xAI',
        tag: 'xai/priority',
        status: 0,
        context_length: 500_000,
        pricing: { prompt: '0.000004', completion: '0.000012' },
        supported_parameters: ['tools', 'reasoning'],
        latency_last_30m: { p50: 2000 },
        throughput_last_30m: { p50: 90 },
      },
    ],
  },
};

const fetchMock = jest.fn<typeof fetch>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const save = jest.fn<(settings: ModelSettings) => void>();

// A key, so the card asks for endpoints, and OpenRouter as the chat endpoint,
// so routing applies at all.
const API_KEYS = {
  checked: true,
  keys: {
    openRouterKey: 'sk-or-1',
    elevenLabsKey: 'sk_el-1',
    llmUrl: 'https://openrouter.ai/api/v1',
  },
  available: true,
  fromEnv: false,
  save: jest.fn(),
  forget: jest.fn(),
} as unknown as ApiKeysState;

function renderCard(patch: Partial<ModelSettings> = {}): void {
  const modelSettings: ModelSettingsState = {
    checked: true,
    settings: { ...DEFAULT_MODEL_SETTINGS, model: 'x/model', ...patch },
    save,
  };
  render(<ModelCard modelSettings={modelSettings} apiKeys={API_KEYS} />);
}

// Rendered, with the endpoints in: they arrive in an effect, and the figures
// are what most of this file asserts.
async function show(patch: Partial<ModelSettings> = {}): Promise<void> {
  renderCard(patch);
  await screen.findByText(/per million tokens/);
}

describe('ModelCard', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // jsdom has no Response; fetchModelDetail reads only these three.
    fetchMock.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(ENDPOINTS),
      } as unknown as Response),
    );
    save.mockReset();
  });

  it('names no provider while OpenRouter is choosing', async () => {
    // The whole point: with a sort, which endpoint answers is decided at
    // request time. Naming one here would be a guess presented as a fact.
    await show({ routing: 'nitro' });
    expect(screen.getByText(/per million tokens/).textContent).toBe(
      '$2.00–$4.00 in / $6.00–$12.00 out, per million tokens',
    );
    expect(screen.getByText('any of 2')).toBeDefined();
    expect(screen.queryByText(/^xAI xai/)).toBeNull();
  });

  it('quotes the pinned endpoint alone, and names it', async () => {
    await show({ routing: 'provider', provider: 'xai/priority' });
    expect(screen.getByText(/per million tokens/).textContent).toBe(
      '$4.00 in / $12.00 out, per million tokens',
    );
    expect(screen.queryByText('any of 2')).toBeNull();
  });

  it('says so when the pinned provider no longer serves the model', async () => {
    // Falling back to another endpoint's figures would quote a price the pin
    // was there to avoid.
    // Not show(): there are no figures to wait for, which is the point.
    renderCard({ routing: 'provider', provider: 'departed' });
    expect(
      await screen.findByText(/No provider departed serves this model/),
    ).toBeDefined();
  });

  it('drops the pin on leaving it, so it cannot reapply itself', async () => {
    await show({ routing: 'provider', provider: 'xai/priority' });
    fireEvent.click(screen.getByRole('button', { name: 'Nitro' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ routing: 'nitro', provider: '' }),
    );
  });

  it('offers reasoning when any reachable endpoint returns it', async () => {
    // Unpinned, the request may land on the one that does, so the switch has
    // something to do.
    await show({ routing: 'nitro' });
    expect(
      screen
        .getByRole('button', { name: 'Send it back' })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('says the model list failed rather than loading for ever', async () => {
    // The list is a separate request from the endpoints. Leaving "Loading…" up
    // when it rejects turns a failure into what reads as a hang.
    fetchMock.mockImplementation((input) =>
      String(input).endsWith('/models')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(ENDPOINTS),
          } as unknown as Response),
    );
    await show({ routing: 'nitro' });
    fireEvent.click(screen.getByRole('button', { name: /Change/ }));
    expect(
      await screen.findByText(/Couldn't load the model list \(offline\)/),
    ).toBeDefined();
    expect(screen.queryByText('Loading the catalogue…')).toBeNull();
  });

  it('disables reasoning when the pinned endpoint returns none', async () => {
    await show({ routing: 'provider', provider: 'xai' });
    expect(screen.getByText(/returns no reasoning/)).toBeDefined();
    expect(
      screen
        .getByRole('button', { name: 'Send it back' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
});
