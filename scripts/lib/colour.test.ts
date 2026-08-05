// What the colour helper decides: whether to emit an escape at all. Which SGR
// number is green is not asserted; that is the terminal's vocabulary, not this
// module's choice.
import { describe, it, expect } from '@jest/globals';
import { palette } from './colour';

// Built, so this file carries no control character either.
const ESC = String.fromCharCode(27);

describe('palette', () => {
  it('wraps the text in an escape when the stream is a terminal', () => {
    const painted = palette({ isTTY: true }).green('done');
    expect(painted.startsWith(`${ESC}[`)).toBe(true);
    expect(painted.endsWith(`${ESC}[0m`)).toBe(true);
    expect(painted).toContain('done');
  });

  it('returns the text untouched when the stream is not a terminal', () => {
    const { green, red, dim } = palette({ isTTY: false });
    expect(green('done')).toBe('done');
    expect(red('failed')).toBe('failed');
    expect(dim('4/9')).toBe('4/9');
  });

  it('leaves a stream with no isTTY at all uncoloured', () => {
    // A redirected stream reports undefined rather than false.
    expect(palette({}).yellow('warning')).toBe('warning');
  });

  it('paints by code for a caller choosing one at runtime', () => {
    expect(palette({ isTTY: true }).paint('31', 'x')).toBe(
      `${ESC}[31mx${ESC}[0m`,
    );
    expect(palette({ isTTY: false }).paint('31', 'x')).toBe('x');
  });

  it('honours NO_COLOR on a terminal', () => {
    const before = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try {
      expect(palette({ isTTY: true }).green('done')).toBe('done');
    } finally {
      if (before === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = before;
    }
  });
});
