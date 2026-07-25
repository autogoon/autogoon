'use client';

// A label/value stat line — the session's State row and the Debug tab's
// latency readouts.

import type { ReactNode } from 'react';

export function StatRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
