// Extraction off the main thread. It is seconds of work rather than minutes —
// nothing crosses a network — but it is CPU-bound inflation plus thousands of
// disk writes, and the UI has an import progress line to keep painting.
import { extractZip } from './extract';

export type ExtractRequest = {
  file: File;
  dir: FileSystemDirectoryHandle;
};

export type ExtractMessage =
  | { type: 'progress'; bytes: number }
  | { type: 'done' }
  | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<ExtractRequest>) => {
  const { file, dir } = event.data;
  const post = (m: ExtractMessage) => {
    self.postMessage(m);
  };
  void extractZip(file, dir, (bytes) => {
    post({ type: 'progress', bytes });
  }).then(
    () => {
      post({ type: 'done' });
    },
    (e: unknown) => {
      post({
        type: 'error',
        message: e instanceof Error ? e.message : 'failed',
      });
    },
  );
};
