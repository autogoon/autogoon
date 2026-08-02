// The Settings control for whether the app takes the microphone at load. It
// holds its own state. Nothing else on screen depends on the value, because the
// spotter reads it once during startup (see listen-on-load.ts).
//
// The read happens after mount, not during render. localStorage doesn't exist
// on the server, and a first render disagreeing with the second hydrates wrong.

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
      // Before the read lands there is nothing true to show. Pressing it then
      // would write a value the reviewer never saw.
      disabled={on === null}
    />
  );
}
