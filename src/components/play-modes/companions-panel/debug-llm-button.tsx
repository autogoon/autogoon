'use client';

// The LLM request viewer's trigger — one button, shared by the Session mic row
// (`short`: icon only, sized to the mic button) and the Debug tab (`long`:
// icon + label). The click handler lives in the panel (it needs the session
// and the overlay state); this owns the look.

import { Braces } from 'lucide-react';
import { Button } from '@/components/button';

export function DebugLLMButton({
  onClick,
  variant = 'short',
}: {
  onClick: () => void;
  variant?: 'short' | 'long';
}) {
  const long = variant === 'long';
  return (
    <Button
      onClick={onClick}
      aria-label="Show LLM request"
      title="Show LLM request"
      className={`flex shrink-0 items-center justify-center ${
        long ? 'gap-2' : 'p-3'
      }`}
    >
      <Braces className={long ? 'size-4' : 'size-5'} />
      {long && 'Show request'}
    </Button>
  );
}
