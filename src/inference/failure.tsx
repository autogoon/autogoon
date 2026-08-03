// What went wrong, wherever it went wrong. Both of the tab's screens write to
// the same `error` on the corpus view, and only one of them is ever on screen,
// so they show it the same way from here.

import { Card } from '@/components/card';

export function Failure({ error }: { error: string | null }) {
  if (error === null) return null;
  return (
    <Card title="That didn't work" accent="rose">
      <span className="block text-sm wrap-break-word">{error}</span>
    </Card>
  );
}
