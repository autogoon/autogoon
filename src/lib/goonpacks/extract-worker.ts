// Extraction off the main thread. It is seconds of work rather than minutes —
// nothing crosses a network — but it is CPU-bound inflation plus thousands of
// disk writes, and the UI has an import progress line to keep painting.
import { extractZip } from './extract';
import { openPackDir } from './store';

export type ExtractRequest = {
  file: File;
  // The pack's key rather than a handle to its directory: a
  // FileSystemDirectoryHandle will not structured-clone to a worker in WebKit,
  // so the worker opens the tree itself. The importer has already created the
  // directory, and holds the lock over it for as long as this runs.
  key: string;
};

export type ExtractMessage =
  | { type: 'progress'; bytes: number }
  | { type: 'done' }
  // `name` is the error's own name — QuotaExceededError is a different story
  // for the user than a zip that won't parse, and only the name tells them
  // apart.
  | { type: 'error'; name: string; message: string };

// The zip is read a chunk at a time, so a gigabyte-scale pack fires this
// thousands of times over to move a percentage with a hundred distinct values —
// and every message is a state change and a render on the main thread.
const PROGRESS_MS = 100;

self.onmessage = (event: MessageEvent<ExtractRequest>) => {
  const { file, key } = event.data;
  const post = (m: ExtractMessage) => {
    self.postMessage(m);
  };
  let lastPost = 0;
  void openPackDir(key)
    .then((dir) =>
      extractZip(file, dir, (bytes) => {
        const now = Date.now();
        if (now - lastPost < PROGRESS_MS) return;
        lastPost = now;
        post({ type: 'progress', bytes });
      }),
    )
    .then(
      () => {
        // Whatever the throttle swallowed, the finished total is posted before
        // done, so the bar never stops short of the end.
        post({ type: 'progress', bytes: file.size });
        post({ type: 'done' });
      },
      (e: unknown) => {
        post({
          type: 'error',
          name: e instanceof Error ? e.name : '',
          message: e instanceof Error ? e.message : 'failed',
        });
      },
    );
};
