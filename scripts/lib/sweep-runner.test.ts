import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepFile, type RunnerDeps } from './sweep-runner';
import { sweepGit } from './sweep-git';
import { sweepQueue } from './sweep-queue';
import type { ClaudeCall, ClaudeRunner } from './sweep-claude';
import type { Finding } from './sweep-findings';

let repo: string;
let out: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sweep-runner-'));
  out = join(repo, '.sweep');
  git('init');
  git('config', 'user.email', 't@example.invalid');
  git('config', 'user.name', 't');
  writeFileSync(join(repo, '.gitignore'), '.sweep/\n');
  writeFileSync(join(repo, 'DOC.md'), 'The app wants to be helpful.\n');
  git('add', '.');
  git('commit', '-m', 'seed');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

const finding: Finding = {
  category: 'personification',
  old: 'The app wants to be helpful.',
  new: 'The app is helpful.',
  evidence: '-',
  rationale: 'personification',
  mechanical: true,
};

// One canned reply per claude call, in call order.
function deps(replies: unknown[], overrides?: Partial<RunnerDeps>): RunnerDeps {
  const claude: ClaudeRunner = async (_call: ClaudeCall) => {
    if (replies.length === 0) throw new Error('unexpected claude call');
    return replies.shift();
  };
  return {
    claude,
    git: sweepGit(repo),
    queue: sweepQueue(out),
    format: async () => {},
    briefs: {
      doc: 'doc brief',
      style: 'style brief',
      register: 'register brief',
      duplication: 'duplication brief',
      verify: 'verify brief',
    },
    cwd: repo,
    log: () => {},
    dryRun: false,
    ...overrides,
  };
}

describe('sweepFile', () => {
  it('applies a mechanical finding and keeps it uncommitted when verify passes', async () => {
    await sweepFile(
      'DOC.md',
      ['style'],
      deps([
        { findings: [finding], read: 'whole file' },
        { ok: true, reasons: [] },
      ]),
    );
    expect(readFileSync(join(repo, 'DOC.md'), 'utf8')).toBe(
      'The app is helpful.\n',
    );
    expect(git('log', '--pretty=%s').trim()).toBe('seed');
    expect(git('status', '--porcelain').trim()).toBe('M DOC.md');
  });

  it("stacks a later pass's edit on an earlier kept one without committing", async () => {
    const second: Finding = {
      ...finding,
      old: 'The app is helpful.',
      new: 'The app helps.',
    };
    await sweepFile(
      'DOC.md',
      ['doc', 'style'],
      deps([
        { findings: [finding], read: 'r' },
        { ok: true, reasons: [] },
        { findings: [second], read: 'r' },
        { ok: true, reasons: [] },
      ]),
    );
    expect(readFileSync(join(repo, 'DOC.md'), 'utf8')).toBe('The app helps.\n');
    expect(git('log', '--pretty=%s').trim()).toBe('seed');
  });

  it('restores the file and queues the findings when verify fails', async () => {
    await sweepFile(
      'DOC.md',
      ['style'],
      deps([
        { findings: [finding], read: 'whole file' },
        { ok: false, reasons: ['lost a fact'] },
      ]),
    );
    expect(readFileSync(join(repo, 'DOC.md'), 'utf8')).toBe(
      'The app wants to be helpful.\n',
    );
    expect(readFileSync(join(out, 'questions.md'), 'utf8')).toContain(
      'verify-fail: lost a fact',
    );
  });

  it('restores the pass edit when the verify call throws', async () => {
    const replies: unknown[] = [{ findings: [finding], read: 'r' }];
    const claude: ClaudeRunner = async () => {
      if (replies.length === 0) throw new Error('verify exploded');
      return replies.shift();
    };
    await sweepFile('DOC.md', ['style'], deps([], { claude }));
    expect(readFileSync(join(repo, 'DOC.md'), 'utf8')).toBe(
      'The app wants to be helpful.\n',
    );
  });

  it('queues a non-mechanical finding without applying it', async () => {
    await sweepFile(
      'DOC.md',
      ['style'],
      deps([{ findings: [{ ...finding, mechanical: false }], read: 'r' }]),
    );
    expect(readFileSync(join(repo, 'DOC.md'), 'utf8')).toBe(
      'The app wants to be helpful.\n',
    );
    expect(readFileSync(join(out, 'questions.md'), 'utf8')).toContain(
      'non-mechanical',
    );
  });

  it('queues a finding whose old text no longer matches', async () => {
    await sweepFile(
      'DOC.md',
      ['style'],
      deps([
        {
          findings: [{ ...finding, old: 'text that is not there' }],
          read: 'r',
        },
      ]),
    );
    expect(readFileSync(join(out, 'questions.md'), 'utf8')).toContain(
      'not-found',
    );
  });

  it('stops after the find report on a dry run', async () => {
    await sweepFile(
      'DOC.md',
      ['style'],
      deps([{ findings: [finding], read: 'r' }], { dryRun: true }),
    );
    expect(readFileSync(join(repo, 'DOC.md'), 'utf8')).toBe(
      'The app wants to be helpful.\n',
    );
    expect(
      JSON.parse(
        readFileSync(join(out, 'reports', 'DOC.md--style.json'), 'utf8'),
      ).findings,
    ).toHaveLength(1);
  });

  it('skips a file that is already dirty before the sweep touches it', async () => {
    writeFileSync(join(repo, 'DOC.md'), "someone else's edit\n");
    const lines: string[] = [];
    await sweepFile(
      'DOC.md',
      ['style'],
      deps([], { log: (l) => lines.push(l) }),
    );
    expect(readFileSync(join(repo, 'DOC.md'), 'utf8')).toBe(
      "someone else's edit\n",
    );
    expect(lines.join('\n')).toContain('dirty');
  });

  it('continues to the next pass when a claude call throws', async () => {
    const calls: string[] = [];
    const claude: ClaudeRunner = async (call) => {
      calls.push(call.prompt.split('\n')[0]!);
      if (calls.length === 1) throw new Error('boom');
      return { findings: [], read: 'r' };
    };
    await sweepFile('DOC.md', ['doc', 'style'], deps([], { claude }));
    expect(calls).toEqual(['doc brief', 'style brief']);
  });
});
