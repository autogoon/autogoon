// The one place an ANSI escape is written. Every script's coloured output comes
// from here, so no other file carries an escape sequence — and nothing carries a
// raw control byte, which is what makes a source file binary to grep: the file
// then answers "no match" to every search, including the ones a review runs.
//
// Keyed to a stream rather than assuming stdout, because warnings go to stderr
// while progress goes to stdout, and only the stream actually attached to a
// terminal should be coloured — `npm run goonpack:build 2> errors` leaves a
// clean file either way.

import process from 'node:process';

export type Paint = (text: string) => string;

export type Palette = {
  // By SGR code, for a caller that picks one at runtime — a table colouring a
  // cell by where its number ranks has no name to reach for.
  paint: (code: string, text: string) => string;
  green: Paint;
  red: Paint;
  yellow: Paint;
  cyan: Paint;
  white: Paint;
  dim: Paint;
};

// NO_COLOR is the usual opt-out, and applies whatever the stream is.
export function palette(stream: { isTTY?: boolean }): Palette {
  const on = stream.isTTY === true && process.env.NO_COLOR === undefined;
  const paint = (code: string, text: string): string =>
    on ? `\x1b[${code}m${text}\x1b[0m` : text;
  const by =
    (code: string): Paint =>
    (text) =>
      paint(code, text);
  return {
    paint,
    green: by('32'),
    red: by('31'),
    yellow: by('33'),
    cyan: by('36'),
    white: by('97'),
    dim: by('2'),
  };
}

export const out = palette(process.stdout);
export const err = palette(process.stderr);
