import { describe, expect, it } from '@jest/globals';
import { claudeRunner } from './sweep-claude';

// Fakes the process boundary: the assertions are on the argv the module
// builds and on how it unwraps the envelope — never on a real model reply.
function fakeExec(stdout: string, captured: string[][]) {
  return async (file: string, args: string[]) => {
    captured.push([file, ...args]);
    return { stdout };
  };
}

const envelope = (fields: object) =>
  JSON.stringify({ type: 'result', is_error: false, ...fields });

describe('claudeRunner', () => {
  it('invokes claude -p read-only with the schema and no session', async () => {
    const captured: string[][] = [];
    const run = claudeRunner({
      cwd: '/repo',
      exec: fakeExec(
        envelope({ structured_output: { findings: [] } }),
        captured,
      ),
    });
    await run({ prompt: 'brief', schema: { type: 'object' } });
    const argv = captured[0]!;
    expect(argv[0]).toBe('claude');
    expect(argv).toContain('-p');
    expect(argv).toContain('brief');
    expect(argv).toContain('--json-schema');
    expect(argv).toContain(JSON.stringify({ type: 'object' }));
    expect(argv).toContain('--no-session-persistence');
    const tools = argv[argv.indexOf('--tools') + 1]!;
    expect(tools).toBe('Read,Grep,Glob');
  });

  it('returns structured_output when the envelope carries it', async () => {
    const run = claudeRunner({
      cwd: '/repo',
      exec: fakeExec(envelope({ structured_output: { ok: true } }), []),
    });
    await expect(run({ prompt: 'p', schema: {} })).resolves.toEqual({
      ok: true,
    });
  });

  it('falls back to parsing result as JSON', async () => {
    const run = claudeRunner({
      cwd: '/repo',
      exec: fakeExec(envelope({ result: '{"ok":false,"reasons":[]}' }), []),
    });
    await expect(run({ prompt: 'p', schema: {} })).resolves.toEqual({
      ok: false,
      reasons: [],
    });
  });

  it('passes --model through when given', async () => {
    const captured: string[][] = [];
    const run = claudeRunner({
      cwd: '/repo',
      exec: fakeExec(envelope({ structured_output: {} }), captured),
    });
    await run({ prompt: 'p', schema: {}, model: 'opus' });
    expect(captured[0]![captured[0]!.indexOf('--model') + 1]).toBe('opus');
  });

  it('rejects when the envelope reports an error', async () => {
    const run = claudeRunner({
      cwd: '/repo',
      exec: fakeExec(envelope({ is_error: true, result: 'over budget' }), []),
    });
    await expect(run({ prompt: 'p', schema: {} })).rejects.toThrow(
      /over budget/,
    );
  });
});
