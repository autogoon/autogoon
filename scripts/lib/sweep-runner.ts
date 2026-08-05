// The per-file loop: find → apply → format → verify → keep or restore. The
// sweep never commits — kept edits accumulate in the working tree for human
// review. Every claude call is a fresh context; this module holds no prose,
// only plumbing, so nothing here can drift toward the register being removed.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyFindings } from './sweep-apply';
import type { ClaudeRunner } from './sweep-claude';
import {
  FINDINGS_SCHEMA,
  VERDICT_SCHEMA,
  parseFindReport,
  parseVerdict,
  type Pass,
  type Verdict,
} from './sweep-findings';
import type { SweepGit } from './sweep-git';
import type { SweepQueue } from './sweep-queue';

export type RunnerDeps = {
  claude: ClaudeRunner;
  git: SweepGit;
  queue: SweepQueue;
  format: (file: string) => Promise<void>;
  briefs: Record<Pass | 'verify', string>;
  cwd: string;
  log: (line: string) => void;
  dryRun: boolean;
  model?: string;
};

export async function sweepFile(
  file: string,
  passes: Pass[],
  deps: RunnerDeps,
): Promise<void> {
  if (deps.git.fileIsDirty(file)) {
    deps.log(`${file}: dirty before sweep, skipped`);
    return;
  }
  for (const pass of passes) {
    try {
      await runPass(file, pass, deps);
    } catch (error) {
      deps.log(`${file} [${pass}]: ${String(error)}`);
    }
  }
}

async function runPass(file: string, pass: Pass, deps: RunnerDeps) {
  const { claude, git, queue, briefs, cwd, log, dryRun, model } = deps;
  const raw = await claude({
    prompt: `${briefs[pass]}\n\nFile: ${file}`,
    schema: FINDINGS_SCHEMA,
    model,
  });
  queue.writeReport(file, pass, raw);
  const report = parseFindReport(raw);
  log(`${file} [${pass}]: ${report.findings.length} findings`);

  for (const finding of report.findings.filter((f) => !f.mechanical))
    queue.question(file, pass, finding, 'non-mechanical');
  if (dryRun) return;

  const path = join(cwd, file);
  const snapshot = readFileSync(path, 'utf8');
  const { content, applied, bounced } = applyFindings(
    snapshot,
    report.findings.filter((f) => f.mechanical),
  );
  for (const bounce of bounced)
    queue.question(file, pass, bounce.finding, bounce.reason);
  if (applied.length === 0) return;

  writeFileSync(path, content);
  let verdict: Verdict;
  try {
    await deps.format(file);
    verdict = parseVerdict(
      await claude({
        prompt: `${briefs.verify}\n\n${git.passDiff(file, snapshot)}`,
        schema: VERDICT_SCHEMA,
        model,
      }),
    );
  } catch (error) {
    writeFileSync(path, snapshot);
    throw error;
  }
  if (verdict.ok) {
    log(`${file} [${pass}]: applied ${applied.length}, kept in working tree`);
  } else {
    writeFileSync(path, snapshot);
    const why = `verify-fail: ${verdict.reasons.join('; ')}`;
    for (const finding of applied) queue.question(file, pass, finding, why);
    log(`${file} [${pass}]: verify failed, restored`);
  }
}
