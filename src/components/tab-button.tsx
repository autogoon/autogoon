// One tab in an underline tab strip — the top-level nav and Companions'
// sub-tabs share this exact look: no fill or box, a 2px underline that
// carries the selected state, muted-to-foreground text on hover. Extracted so
// the two strips can't drift (and so the underline resets against Button's
// default control shell live in one place).

import type { ReactNode } from 'react';
import { Button } from '@/components/button';

export function TabButton({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  // Extras only (e.g. ml-auto to start a right-aligned group).
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      // The selected tab restyles itself, so the press/voice flash is noise.
      flash={false}
      onClick={onClick}
      className={`-mb-px rounded-none border-0 border-b-2 bg-transparent px-0 py-3 text-sm font-medium enabled:hover:bg-transparent ${
        active
          ? 'border-foreground text-foreground'
          : 'text-muted-foreground hover:text-foreground border-transparent'
      } ${className ?? ''}`}
    >
      {children}
    </Button>
  );
}
