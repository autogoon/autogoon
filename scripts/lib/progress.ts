// A one-line counter the authoring scripts rewrite in place, for the passes
// that run per file and take long enough on a real pack to look like a hang.
// One counter serves every pass: each `step` carries its own label, so moving
// from checking to reading to zipping just redraws the line.
//
// Only drawn on a TTY, and on stderr: a redirected build log should hold the
// status lines and the warnings, not a carriage return per picture.
//
// Every step draws. Thinning them looks like a stall wherever the per-file
// work is uneven — a zip of pictures spends seconds on files a sidecar pass
// crosses in a millisecond — and a few thousand writes of thirty bytes costs
// nothing against reading those files at all.

// Where the counter draws. Narrower than a WriteStream so a test can pass
// something that only collects, and so nothing here depends on a tty.
export type Writer = { write: (text: string) => void };

export type Progress = {
  // What pass, how many of it are finished, and how many there are. Safe to
  // call for every one of them.
  step: (label: string, done: number, total: number) => void;
  // Wipes the line, so whatever the caller prints next starts clean.
  clear: () => void;
};

const IDLE: Progress = { step: () => {}, clear: () => {} };

export function progress(
  out: Writer | null = process.stderr.isTTY ? process.stderr : null,
): Progress {
  if (out === null) return IDLE;
  // The widest line drawn so far, so a shorter one can't leave the tail of a
  // longer one behind it.
  let width = 0;
  return {
    step: (label, done, total) => {
      if (total === 0) return;
      const text = `  ${label} ${done}/${total}`;
      width = Math.max(width, text.length);
      out.write(`\r${text.padEnd(width)}`);
    },
    clear: () => {
      if (width === 0) return;
      out.write(`\r${' '.repeat(width)}\r`);
      width = 0;
    },
  };
}
