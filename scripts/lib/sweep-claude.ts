// One fresh `claude -p` per call: no session, read-only tools, structured
// output validated by the CLI against the pass schema. Freshness is the
// point — a context that has read many files drifts toward the register it
// is removing, so no invocation here ever sees more than one file's work.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type ClaudeCall = { prompt: string; schema: object; model?: string };
export type ClaudeRunner = (call: ClaudeCall) => Promise<unknown>;

type Exec = (
  file: string,
  args: string[],
  opts: { cwd: string },
) => Promise<{ stdout: string }>;

const realExec: Exec = async (file, args, opts) =>
  promisify(execFile)(file, args, {
    ...opts,
    // Ten minutes and 32 MiB: a doc pass greps the repo and can be slow,
    // and the JSON envelope carries whole findings.
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
  });

export function claudeRunner(opts: { cwd: string; exec?: Exec }): ClaudeRunner {
  const exec = opts.exec ?? realExec;
  return async ({ prompt, schema, model }) => {
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--tools',
      'Read,Grep,Glob',
      '--no-session-persistence',
    ];
    if (model) args.push('--model', model);
    const { stdout } = await exec('claude', args, { cwd: opts.cwd });
    const envelope = JSON.parse(stdout) as {
      is_error?: boolean;
      result?: string;
      structured_output?: unknown;
    };
    if (envelope.is_error)
      throw new Error(`claude -p failed: ${envelope.result ?? 'no detail'}`);
    return envelope.structured_output ?? JSON.parse(envelope.result ?? '');
  };
}
