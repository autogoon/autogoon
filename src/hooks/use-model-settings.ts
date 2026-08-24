// React state for the model the companions run on. Read after mount, like the
// keys (see use-api-keys.ts): localStorage doesn't exist during the server
// render, so a render-time read would hydrate wrong.
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_MODEL_SETTINGS,
  type ModelSettings,
  readModelSettings,
  writeModelSettings,
} from '@/lib/companions/model-settings';

export type ModelSettingsState = {
  // Has the stored value been read? Until it has, the card shows nothing rather
  // than the defaults, so no control writes back a value nobody chose.
  checked: boolean;
  settings: ModelSettings;
  save: (settings: ModelSettings) => void;
};

export function useModelSettings(): ModelSettingsState {
  const [state, setState] = useState<{
    checked: boolean;
    settings: ModelSettings;
  }>({ checked: false, settings: DEFAULT_MODEL_SETTINGS });

  useEffect(() => {
    setState({ checked: true, settings: readModelSettings() });
  }, []);

  const save = useCallback((settings: ModelSettings): void => {
    writeModelSettings(settings);
    setState({ checked: true, settings });
  }, []);

  return { ...state, save };
}
