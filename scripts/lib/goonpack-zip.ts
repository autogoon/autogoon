// A pack source written out as a zip, one file open at a time: each is written
// as it is read and the reader pauses when the output stream is full, so peak
// memory is a chunk rather than the pack. The app reads a pack back the same
// way (src/lib/goonpacks/extract.ts), and reads a stored entry as readily as a
// deflated one — fflate's Unzip handles the stored method with nothing
// registered.
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { MEDIA_TYPES, splitName } from '../../src/lib/goonpacks/media';

export function writeZip(
  dir: string,
  names: string[],
  out: string,
  // How many files are written, as each one finishes. Deflating a pack of
  // pictures is the longest thing the build does.
  onFile?: (done: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sink = createWriteStream(out);
    sink.on('error', reject);
    // fflate's Zip is callback-based, hence the promise around it.
    const zip = new Zip((err, chunk, final) => {
      if (err !== null) return reject(err);
      sink.write(chunk);
      if (final) sink.end(() => resolve());
    });
    const next = (i: number): void => {
      if (i === names.length) return zip.end();
      const name = names[i]!;
      // Media is stored and everything else deflated. Pictures and video tend
      // to shrink by under a percent, which doesn't pay for the time spent
      // trying — it is the dominant cost of building a large pack. A pack's
      // text does shrink, and text is what a pack accumulates as more media is
      // described. A zip carries a method per entry, so the two mix freely.
      const entry =
        MEDIA_TYPES[splitName(name).ext] === undefined
          ? new ZipDeflate(name, { level: 6 })
          : new ZipPassThrough(name);
      zip.add(entry);
      const source = createReadStream(join(dir, name));
      source.on('error', reject);
      source.on('data', (chunk: string | Buffer) => {
        // The stream is opened with no encoding, so every chunk is a Buffer.
        entry.push(chunk as Buffer);
        if (sink.writableNeedDrain) {
          source.pause();
          sink.once('drain', () => source.resume());
        }
      });
      // An empty file reaches this having fired no data event at all, so the
      // final push is the only one its entry gets.
      source.on('end', () => {
        entry.push(new Uint8Array(0), true);
        onFile?.(i + 1, names.length);
        next(i + 1);
      });
    };
    next(0);
  });
}
