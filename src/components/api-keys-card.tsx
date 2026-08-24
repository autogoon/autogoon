// Where the user's provider keys are entered. Companions spends money on every
// turn — LLM, TTS, STT — and it spends the user's own, so this card is the whole
// of the feature's configuration: fill it in and Companions appears on the home
// screen, forget it and the mode goes away again.
//
// Settings, not play: this is set once with a free hand, so nothing here has a
// voice command.

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { ApiKeysState } from '@/hooks/use-api-keys';
import type { KeyCheck } from '@/lib/companions/validate-keys';
import { type ApiKeys, DEFAULT_LLM_URL } from '@/lib/companions/keys';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import {
  CONTROL_BORDER,
  CONTROL_BUTTON_BASE,
  CONTROL_INPUT,
} from '@/components/controls';

// The .env button exists on the dev server only, because the route behind it
// does (see api/dev/keys). A build has no keys of its own to offer.
const IS_DEV = process.env.NODE_ENV === 'development';

export function ApiKeysCard({ apiKeys }: { apiKeys: ApiKeysState }) {
  const [fields, setFields] = useState<ApiKeys>(apiKeys.keys);
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<KeyCheck | null>(null);

  // Follow the stored value: the first read lands in an effect, and Forget and
  // the .env button both replace what's there.
  useEffect(() => {
    setFields(apiKeys.keys);
  }, [apiKeys.keys]);

  const set = (patch: Partial<ApiKeys>): void => {
    setFields((f) => ({ ...f, ...patch }));
    setCheck(null);
  };

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setCheck(await apiKeys.save({ ...fields, llmUrl: fields.llmUrl.trim() }));
    setSaving(false);
  };

  // Fill the fields from the server's .env — it still takes a Save, so a
  // loaded key goes through the same check as a pasted one.
  const loadFromEnv = async (): Promise<void> => {
    const res = await fetch('/api/dev/keys');
    if (!res.ok) return;
    setFields(await (res.json() as Promise<ApiKeys>));
    setCheck(null);
  };

  if (!apiKeys.checked) return null;

  const rejected =
    check !== null && (!check.openRouter || !check.elevenLabs)
      ? [
          check.openRouter ? null : 'OpenRouter',
          check.elevenLabs ? null : 'ElevenLabs',
        ]
          .filter((n) => n !== null)
          .join(' and ')
      : null;

  return (
    <Card title="API keys">
      <p>
        {apiKeys.available
          ? 'Stored on this device. Companions is on the home screen.'
          : 'Companions runs on your own OpenRouter and ElevenLabs keys. Enter both to turn it on — they stay on this device.'}
      </p>

      <label className="flex flex-col gap-1">
        OpenRouter key
        <input
          type="password"
          value={fields.openRouterKey}
          onChange={(e) => set({ openRouterKey: e.target.value })}
          placeholder="sk-or-…"
          spellCheck={false}
          autoComplete="off"
          className={CONTROL_INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        ElevenLabs key
        <input
          type="password"
          value={fields.elevenLabsKey}
          onChange={(e) => set({ elevenLabsKey: e.target.value })}
          placeholder="sk_…"
          spellCheck={false}
          autoComplete="off"
          className={CONTROL_INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        Chat endpoint
        <input
          type="text"
          value={fields.llmUrl}
          onChange={(e) => set({ llmUrl: e.target.value })}
          placeholder={DEFAULT_LLM_URL}
          spellCheck={false}
          autoComplete="off"
          className={CONTROL_INPUT}
        />
      </label>

      <div className="flex items-stretch gap-2">
        <Button
          onClick={() => void save()}
          disabled={
            saving ||
            fields.openRouterKey.trim() === '' ||
            fields.elevenLabsKey.trim() === ''
          }
          className={`${CONTROL_BUTTON_BASE} flex shrink-0 items-center gap-1.5 ${
            rejected !== null
              ? 'border-destructive text-destructive'
              : CONTROL_BORDER
          }`}
        >
          <KeyRound className="size-4" />
          {saving ? 'Checking…' : 'Save'}
        </Button>
        {IS_DEV && (
          <Button
            onClick={() => void loadFromEnv()}
            className={`${CONTROL_BUTTON_BASE} ${CONTROL_BORDER} shrink-0`}
          >
            Load from .env
          </Button>
        )}
        {apiKeys.available && (
          <Button
            onClick={apiKeys.forget}
            className={`${CONTROL_BUTTON_BASE} ${CONTROL_BORDER} shrink-0`}
          >
            Forget
          </Button>
        )}
      </div>

      {rejected !== null && (
        <p className="text-destructive text-sm">{rejected} rejected the key.</p>
      )}
      {check !== null && rejected === null && (
        <p className="text-emerald-500">Saved.</p>
      )}
    </Card>
  );
}
