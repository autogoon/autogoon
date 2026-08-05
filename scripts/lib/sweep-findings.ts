// The wire contract between the sweep and its claude invocations: the find
// schema every pass returns findings in, and the verify verdict. The CLI
// validates against the same schemas (--json-schema); the parsers re-check
// so a malformed envelope fails here, named, not downstream in apply.

export const PASSES = ['doc', 'style', 'register', 'duplication'] as const;
export type Pass = (typeof PASSES)[number];

export type Finding = {
  category: string;
  // Verbatim current text, long enough to match exactly once in the file.
  old: string;
  // Exact replacement; "" deletes `old`.
  new: string;
  // file:line proving drift, or the other copy quoted for duplication.
  evidence: string;
  rationale: string;
  // False when two defensible outcomes exist — routed to the questions
  // file instead of applied.
  mechanical: boolean;
  // False when the reviewer, weighing its own rationale, advises against
  // the fix. Recorded in the raw report for audit, applied nowhere, and
  // never queued — not applying a fix needs no human gate.
  recommend: boolean;
};

export type FindReport = { findings: Finding[]; read: string };
export type Verdict = { ok: boolean; reasons: string[] };

const FINDING_PROPERTIES = {
  category: { type: 'string' },
  old: { type: 'string' },
  new: { type: 'string' },
  evidence: { type: 'string' },
  rationale: { type: 'string' },
  mechanical: { type: 'boolean' },
  recommend: { type: 'boolean' },
} as const;

export const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'read'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: Object.keys(FINDING_PROPERTIES),
        properties: FINDING_PROPERTIES,
      },
    },
    read: { type: 'string' },
  },
} as const;

export const VERDICT_SCHEMA = {
  type: 'object',
  required: ['ok', 'reasons'],
  properties: {
    ok: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
} as const;

function field(value: unknown, name: string, type: 'string' | 'boolean') {
  if (typeof value !== type) throw new Error(`${name} is not a ${type}`);
}

export function parseFindReport(value: unknown): FindReport {
  const report = value as FindReport;
  if (!Array.isArray(report?.findings))
    throw new Error('findings is not an array');
  field(report.read, 'read', 'string');
  for (const f of report.findings) {
    field(f?.category, 'category', 'string');
    field(f?.old, 'old', 'string');
    field(f?.new, 'new', 'string');
    field(f?.evidence, 'evidence', 'string');
    field(f?.rationale, 'rationale', 'string');
    field(f?.mechanical, 'mechanical', 'boolean');
    field(f?.recommend, 'recommend', 'boolean');
  }
  return report;
}

export function parseVerdict(value: unknown): Verdict {
  const verdict = value as Verdict;
  field(verdict?.ok, 'ok', 'boolean');
  if (!Array.isArray(verdict?.reasons))
    throw new Error('reasons is not an array');
  for (const reason of verdict.reasons) field(reason, 'reason', 'string');
  return verdict;
}
