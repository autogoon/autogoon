// A plain surface card: rounded border, padded, with an optional heading.
// Content is stacked with a small gap. Pass `title` for the common
// heading-then-content layout, or omit it and lay the children out yourself.

import type { ReactNode } from "react";

export function Card({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-card space-y-2 rounded-xl border px-4 py-2 ${
        className !== undefined ? ` ${className}` : ""
      }`}
    >
      {title !== undefined && <h2 className="font-semibold">{title}</h2>}
      {children}
    </div>
  );
}
