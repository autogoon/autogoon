// React state for the provider keys Companions runs on. Whether the mode
// appears at all hangs off this: it is offered when both keys are in force and
// hidden when they aren't, and there is no server-side gate behind it — the
// keys are the user's, and the only thing they unlock is the user's own
// spending.
//
// The keys come from one of two places, never both:
//
//   - the dev server's `.env`, read once at load through /api/dev/keys. Nothing
//     is written to this browser, and Settings shows the fields locked.
//   - what was pasted into Settings, in localStorage. This is the only way a
//     build works, since no build serves that route.
//
// Both reads happen in an effect rather than at render: one is a fetch, and
// localStorage doesn't exist during the server render, so a render-time read
// would disagree with the client's.
import { useCallback, useEffect, useState } from 'react';
import {
  type ApiKeys,
  DEFAULT_LLM_URL,
  clearKeys,
  hasKeys,
  readKeys,
  setEnvKeys,
  writeKeys,
} from '@/lib/companions/keys';
import { type KeyCheck, validateKeys } from '@/lib/companions/validate-keys';

export type ApiKeysState = {
  // Has the source been settled? Guards against offering Companions — or
  // bouncing away from it — before we know which keys are in force.
  checked: boolean;
  keys: ApiKeys;
  // Both keys present, which is what Companions needs to run at all.
  available: boolean;
  // The keys came from the dev server's `.env`. Settings then shows them and
  // nothing else: there is nothing to save, and nothing stored to forget.
  fromEnv: boolean;
  // Why the `.env` keys were not read, when the dev server was asked and did
  // not answer. Null when there was nothing to read, which is not a failure.
  envFailure: string | null;
  // Validate, then store when both providers accept. Returns what each said, so
  // the one that failed can be named. Never called in `.env` mode.
  save: (keys: ApiKeys) => Promise<KeyCheck>;
  forget: () => void;
};

// What the dev server's `.env` holds. `keys` is null when there is no dev
// server, no `.env` behind it, or nothing in it — the ordinary case, and not an
// error. `failed` is the other thing: the route was there and did not answer,
// which is worth saying, because the alternative is empty fields that look
// exactly like having no `.env`.
type EnvRead = { keys: ApiKeys | null; failed: string | null };

async function envKeys(): Promise<EnvRead> {
  // The route only exists under `npm run dev`, so a build skips the request
  // rather than making one that is always a 404. Read here rather than at module
  // load: the bundler inlines it either way, and a constant would fix the answer
  // to whenever this module first happened to be imported.
  if (process.env.NODE_ENV !== 'development')
    return { keys: null, failed: null };
  try {
    const res = await fetch('/api/dev/keys');
    if (res.status === 404) return { keys: null, failed: null };
    if (!res.ok) return { keys: null, failed: `/api/dev/keys — ${res.status}` };
    const keys = (await res.json()) as ApiKeys;
    const supplied = keys.openRouterKey !== '' || keys.elevenLabsKey !== '';
    return { keys: supplied ? keys : null, failed: null };
  } catch (e: unknown) {
    return { keys: null, failed: e instanceof Error ? e.message : String(e) };
  }
}

export function useApiKeys(): ApiKeysState {
  // Defaults until the effect below runs — never storage, which the server
  // render doesn't have.
  const [state, setState] = useState<{
    checked: boolean;
    keys: ApiKeys;
    fromEnv: boolean;
    envFailure: string | null;
  }>({
    checked: false,
    keys: { openRouterKey: '', elevenLabsKey: '', llmUrl: DEFAULT_LLM_URL },
    fromEnv: false,
    envFailure: null,
  });

  useEffect(() => {
    let alive = true;
    void envKeys().then(({ keys, failed }) => {
      if (!alive) return;
      // Told before read: readKeys() is what every call site uses, and it has
      // to answer with the `.env` keys from here on.
      setEnvKeys(keys);
      setState({
        checked: true,
        keys: readKeys(),
        fromEnv: keys !== null,
        envFailure: failed,
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (keys: ApiKeys): Promise<KeyCheck> => {
    const check = await validateKeys(keys);
    if (check.openRouter && check.elevenLabs) {
      writeKeys(keys);
      // A `.env` that wouldn't read no longer explains anything: these keys are
      // the ones in force, and they were pasted.
      setState({ checked: true, keys, fromEnv: false, envFailure: null });
    }
    return check;
  }, []);

  const forget = useCallback((): void => {
    clearKeys();
    // The `.env` failure is kept: it is still why no `.env` keys are in force,
    // and forgetting doesn't ask the route again.
    setState((s) => ({
      ...s,
      checked: true,
      keys: readKeys(),
      fromEnv: false,
    }));
  }, []);

  return {
    ...state,
    available: hasKeys(state.keys),
    save,
    forget,
  };
}
