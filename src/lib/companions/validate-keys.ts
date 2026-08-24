// Checking a key when it is entered, rather than at the first turn. Both
// providers have a cheap authenticated GET that costs nothing and answers 401
// for a bad key, which is enough to catch the case this exists for: a paste
// that lost a character, found mid-session with your hands full.
//
// Only an outright rejection counts as invalid. Anything else — a network
// failure, a 404 from an OpenAI-compatible endpoint that isn't OpenRouter and
// has no /key — passes: telling someone their working key is broken is worse
// than letting a broken one through to an error that names the provider.
import type { ApiKeys } from './keys';

export type KeyCheck = { openRouter: boolean; elevenLabs: boolean };

async function accepted(url: string, headers: HeadersInit): Promise<boolean> {
  try {
    const res = await fetch(url, { headers });
    return res.status !== 401 && res.status !== 403;
  } catch {
    return true;
  }
}

export async function validateKeys(keys: ApiKeys): Promise<KeyCheck> {
  const [openRouter, elevenLabs] = await Promise.all([
    accepted(`${keys.llmUrl.replace(/\/$/, '')}/key`, {
      authorization: `Bearer ${keys.openRouterKey}`,
    }),
    accepted('https://api.elevenlabs.io/v1/user', {
      'xi-api-key': keys.elevenLabsKey,
    }),
  ]);
  return { openRouter, elevenLabs };
}
