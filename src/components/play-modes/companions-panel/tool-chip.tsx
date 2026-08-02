// A centered "action" chip marking a tool call the companion made, so it's
// visible in the transcript whether they actually called it.

import { Cog } from 'lucide-react';

export function ToolChip({ name, result }: { name: string; result: string }) {
  return (
    <div className="flex justify-center">
      <span className="text-muted-foreground bg-foreground/5 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs">
        <Cog className="size-3" />
        {name} → {result}
      </span>
    </div>
  );
}
