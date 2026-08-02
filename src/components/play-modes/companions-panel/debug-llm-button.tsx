// The LLM request viewer's trigger, on the Debug tab. The click handler lives
// in the panel (it needs the session and the overlay state); this owns the look.

import { Braces } from 'lucide-react';
import { Button } from '@/components/button';

export function DebugLLMButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      aria-label="Show LLM request"
      title="Show LLM request"
      className="flex shrink-0 items-center justify-center gap-2"
    >
      <Braces className="size-4" />
      Show request
    </Button>
  );
}
