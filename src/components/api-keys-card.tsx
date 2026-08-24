// Where the provider keys Companions runs on are entered. Every turn costs
// money — LLM, TTS, STT — so this card is the whole of the feature's
// configuration: fill it in and Companions appears on the home screen, forget
// it and the mode goes away again.
//
// Two modes, because the keys come from one place or the other (see
// use-api-keys.ts). With a `.env` behind the dev server the fields show what it
// supplied and are locked — there is nothing to save, and nothing of yours is
// kept in this browser. Otherwise they are yours to paste, and they stay here.
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

export function ApiKeysCard({ apiKeys }: { apiKeys: ApiKeysState }) {
  const [fields, setFields] = useState<ApiKeys>(apiKeys.keys);
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<KeyCheck | null>(null);

  // Follow the keys in force: the first read lands in an effect, and Forget
  // replaces what's there.
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

  if (!apiKeys.checked) return null;

  const locked = apiKeys.fromEnv;
  const rejected =
    check !== null && (!check.openRouter || !check.elevenLabs)
      ? [
          check.openRouter ? null : 'OpenRouter',
          check.elevenLabs ? null : 'ElevenLabs',
        ]
          .filter((n) => n !== null)
          .join(' and ')
      : null;
  // In .env mode a missing key can't be fixed here, so the card says which one
  // and where it goes instead of offering a box that does nothing.
  const missingFromEnv = [
    fields.openRouterKey === '' ? 'OPENROUTER_API_KEY' : null,
    fields.elevenLabsKey === '' ? 'ELEVENLABS_API_KEY' : null,
  ].filter((n) => n !== null);

  const field = (
    label: string,
    value: string,
    placeholder: string,
    onChange: (next: string) => void,
    type: 'password' | 'text' = 'password',
  ) => (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        disabled={locked}
        readOnly={locked}
        className={`${CONTROL_INPUT} ${locked ? 'opacity-60' : ''}`}
      />
    </label>
  );

  return (
    <Card title="API keys">
      <p>
        {locked
          ? "These come from the server's .env file and stay there. Nothing is kept in this browser."
          : 'Companions runs on your own OpenRouter and ElevenLabs keys. Enter both to turn it on — they stay on this device.'}
      </p>

      {field('OpenRouter key', fields.openRouterKey, 'sk-or-…', (v) =>
        set({ openRouterKey: v }),
      )}
      {field('ElevenLabs key', fields.elevenLabsKey, 'sk_…', (v) =>
        set({ elevenLabsKey: v }),
      )}
      {field(
        'Chat endpoint',
        fields.llmUrl,
        DEFAULT_LLM_URL,
        (v) => set({ llmUrl: v }),
        'text',
      )}

      {locked ? (
        missingFromEnv.length > 0 && (
          <p className="text-destructive text-sm">
            {`${missingFromEnv.join(' and ')} ${
              missingFromEnv.length > 1 ? 'are' : 'is'
            } missing from .env.`}
          </p>
        )
      ) : (
        <>
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
            <p className="text-destructive text-sm">
              {rejected} rejected the key.
            </p>
          )}
          {check !== null && rejected === null && (
            <p className="text-emerald-500">Saved.</p>
          )}
        </>
      )}
    </Card>
  );
}
