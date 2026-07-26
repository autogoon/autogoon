// Zip → OPFS tree. The zip is transport: it is streamed once, entry by entry,
// straight to disk, and never held whole. Backpressure is explicit — each pushed
// chunk's writes are awaited before the next chunk is read — so peak memory is a
// couple of chunks regardless of how big the pack is.
import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import { isJunkPath } from './media';
import { MANIFEST } from './pack';
import { MARKER } from './store';

// One zip entry's destination, opened lazily (the handle is async; fflate's
// ondata is not).
type Sink = {
  // Views over a plain ArrayBuffer, which is what a writable stream takes —
  // fflate types its output as the wider Uint8Array<ArrayBufferLike>, but
  // inflate never produces a shared-buffer view.
  queue: Uint8Array<ArrayBuffer>[];
  done: boolean;
  writer: Promise<FileSystemWritableFileStream> | null;
};

// Open `media/x.jpg` inside the pack directory, creating `media/` as needed.
async function fileHandle(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/');
  let at = dir;
  for (const part of parts.slice(0, -1)) {
    at = await at.getDirectoryHandle(part, { create: true });
  }
  return at.getFileHandle(parts[parts.length - 1]!, { create: true });
}

export async function extractZip(
  file: File,
  dir: FileSystemDirectoryHandle,
  onProgress?: (bytesRead: number) => void,
): Promise<void> {
  const sinks: Sink[] = [];
  const unzip = new Unzip((entry) => {
    // The marker is the import's own signature, written last of all, and a zip
    // carrying a root file of that name would forge it: written early here, it
    // would leave an interrupted import looking finished, which the clean pass
    // then spares forever. Validation ignores extra root files anyway, so
    // dropping it costs the pack nothing.
    if (isJunkPath(entry.name) || entry.name === MARKER) {
      entry.ondata = () => {
        // read and discard: junk never lands in a tree
      };
      entry.start();
      return;
    }
    const sink: Sink = { queue: [], done: false, writer: null };
    sinks.push(sink);
    sink.writer = fileHandle(dir, entry.name).then((h) => h.createWritable());
    entry.ondata = (err, chunk, final) => {
      if (err !== null) throw err;
      if (chunk.length > 0) sink.queue.push(chunk as Uint8Array<ArrayBuffer>);
      if (final) sink.done = true;
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  // Drain every open sink: writes land in order because each sink's promise
  // chain is sequential, and the caller awaits this between pushes.
  const drain = async (): Promise<void> => {
    for (const sink of sinks) {
      if (sink.writer === null) continue;
      const writer = await sink.writer;
      while (sink.queue.length > 0) {
        await writer.write(sink.queue.shift()!);
      }
      if (sink.done) {
        await writer.close();
        sink.writer = null;
      }
    }
  };

  const reader = file.stream().getReader();
  let read = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      read += value.length;
      unzip.push(value, false);
      await drain();
      onProgress?.(read);
    }
    unzip.push(new Uint8Array(0), true);
    await drain();
  } catch (e) {
    // Close what's open so the tree isn't left holding locks; the caller
    // deletes it. No marker was written, so the clean pass would too. Every
    // sink gets its turn and the original failure is what's thrown — a sink
    // whose handle never opened must not become the error the caller sees.
    for (const sink of sinks) {
      try {
        if (sink.writer !== null) await (await sink.writer).close();
      } catch {
        // this one's stream is already broken — there is nothing to salvage
      }
    }
    throw e;
  } finally {
    await reader.cancel().catch(() => {
      // already drained
    });
  }
}

// Read a zip's manifest.json without extracting anything, so the confirm sheet
// can name the pack before a byte is written. Resolves as soon as the manifest
// is complete — it sorts before media/ in every zip tool's ordering, so this
// normally reads a few kilobytes. A zip with no root manifest is read to the
// end, and `names` is what parsePack needs to name the mistake.
export async function peekZip(
  file: File,
): Promise<{ manifest: string | null; names: string[] }> {
  const names: string[] = [];
  const chunks: Uint8Array[] = [];
  let manifest: string | null = null;
  const unzip = new Unzip((entry) => {
    names.push(entry.name);
    entry.ondata = (err, chunk, final) => {
      if (err !== null || entry.name !== MANIFEST) return;
      if (chunk.length > 0) chunks.push(chunk);
      if (final) {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const joined = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) {
          joined.set(c, at);
          at += c.length;
        }
        manifest = strFromU8(joined);
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  try {
    while (manifest === null) {
      const { value, done } = await reader.read();
      if (done) break;
      unzip.push(value, false);
    }
  } catch {
    // A zip we can't read peeks as nothing; the import reports it.
  } finally {
    await reader.cancel().catch(() => {
      // already at the end
    });
  }
  return { manifest, names };
}
