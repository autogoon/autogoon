// Deterministic application of findings: exact, unique string match or no
// edit at all. Anything that cannot be applied verbatim bounces to the
// questions file — the sweep never paraphrases a replacement.

import type { Finding } from './sweep-findings';

export type Bounce = {
  finding: Finding;
  reason: 'not-found' | 'not-unique' | 'no-op';
};

export type ApplyResult = {
  content: string;
  applied: Finding[];
  bounced: Bounce[];
};

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + 1)
  )
    count += 1;
  return count;
}

export function applyFindings(
  content: string,
  findings: Finding[],
): ApplyResult {
  const applied: Finding[] = [];
  const bounced: Bounce[] = [];
  for (const finding of findings) {
    if (finding.old === finding.new || finding.old === '') {
      bounced.push({ finding, reason: 'no-op' });
      continue;
    }
    const count = occurrences(content, finding.old);
    if (count === 0) {
      bounced.push({ finding, reason: 'not-found' });
      continue;
    }
    if (count > 1) {
      bounced.push({ finding, reason: 'not-unique' });
      continue;
    }
    content = content.replace(finding.old, () => finding.new);
    applied.push(finding);
  }
  return { content, applied, bounced };
}
