// The Settings control for whether the app takes the microphone at load. Owns
// its own state rather than taking it from above: nothing else on screen
// changes when it does, because the spotter reads the stored value once at load
// (see listen-on-load.ts).
//
// Read after mount, not during render — localStorage doesn't exist on the
// server, and a first render that disagreed with the second would hydrate
// wrong.

import { useEffect, useState } from 'react';
import { Segmented } from '@/components/segmented';
import { listensOnLoad, setListensOnLoad } from '@/lib/listen-on-load';

const OPTIONS = [
  { value: 'wait', label: 'Wait for me' },
  { value: 'listen', label: 'Listen on load' },
] as const;

export function ListenOnLoadField() {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    setOn(listensOnLoad());
  }, []);

  return (
    <Segmented
      options={OPTIONS}
      value={on === true ? 'listen' : 'wait'}
      onChange={(next) => {
        const listen = next === 'listen';
        setOn(listen);
        setListensOnLoad(listen);
      }}
      // Until the stored value has been read there is nothing true to show, so
      // the control can't be pressed into disagreeing with it.
      disabled={on === null}
    />
  );
}
