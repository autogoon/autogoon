'use client';

// The event log reuses the shared LogCard (monospace, timestamped, colour-by-
// kind, auto-scrolling, dev-only) so it matches the other play modes' logs.
// Memoized on its entries so the ~50 Hz rms churn doesn't reconcile it.

import { memo } from 'react';
import { LogCard, type LogEntry } from '@/components/log-card';

export const EventLog = memo(function EventLog({
  entries,
}: {
  entries: LogEntry[];
}) {
  return <LogCard title="Events" entries={entries} />;
});
