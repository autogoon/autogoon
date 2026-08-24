// React state for the user's provider keys. Whether Companions appears at all
// hangs off this: the mode is offered when both keys are stored and hidden when
// they aren't, and there is no server-side gate behind it any more — the keys
// are the user's, and the only thing they unlock is the user's own spending.
//
// The initial read happens in an effect rather than at render: localStorage
// doesn't exist during the server render, and a render-time read would disagree
// with it.
import { useCallback, useEffect, useState } from 'react';
import {
  type ApiKeys,
  DEFAULT_LLM_URL,
  clearKeys,
  hasKeys,
  readKeys,
  writeKeys,
} from '@/lib/companions/keys';
import { type KeyCheck, validateKeys } from '@/lib/companions/validate-keys';

export type ApiKeysState = {
  // Has the stored value been read? Guards against offering Companions — or
  // bouncing away from it — before we know what this browser holds.
  checked: boolean;
  keys: ApiKeys;
  // Both keys present, which is what Companions needs to run at all.
  available: boolean;
  // Validate, then store when both providers accept. Returns what each said, so
  // the one that failed can be named.
  save: (keys: ApiKeys) => Promise<KeyCheck>;
  forget: () => void;
};

export function useApiKeys(): ApiKeysState {
  // Defaults until the effect below runs — never storage, which the server
  // render doesn't have.
  const [state, setState] = useState<{ checked: boolean; keys: ApiKeys }>({
    checked: false,
    keys: { openRouterKey: '', elevenLabsKey: '', llmUrl: DEFAULT_LLM_URL },
  });

  useEffect(() => {
    setState({ checked: true, keys: readKeys() });
  }, []);

  const save = useCallback(async (keys: ApiKeys): Promise<KeyCheck> => {
    const check = await validateKeys(keys);
    if (check.openRouter && check.elevenLabs) {
      writeKeys(keys);
      setState({ checked: true, keys });
    }
    return check;
  }, []);

  const forget = useCallback((): void => {
    clearKeys();
    setState({ checked: true, keys: readKeys() });
  }, []);

  return {
    ...state,
    available: hasKeys(state.keys),
    save,
    forget,
  };
}
