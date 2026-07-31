// A pack source written out as a zip, one file open at a time: each is deflated
// as it is read and the reader pauses when the output stream is full, so peak
// memory is a chunk rather than the pack. The app reads a pack back the same
// way (src/lib/goonpacks/extract.ts).
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Zip, ZipDeflate } from 'fflate';

export function writeZip(
  dir: string,
  names: string[],
  out: string,
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
      // Deflated, like the `zip -r` an author would run. Stills and video
      // barely shrink, but a pack's text does, and text is what a pack
      // accumulates as more media is described.
      const entry = new ZipDeflate(name, { level: 6 });
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
        next(i + 1);
      });
    };
    next(0);
  });
}
