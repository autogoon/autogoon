// A flat titled section — heading then stacked content, matching the home
// page's look (no border or box; whitespace does the separating). Pass `title`
// for the common heading-then-content layout, or omit it and lay the children
// out yourself. Still called Card: it's the unit the panels are built from.

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
      className={`space-y-2${className !== undefined ? ` ${className}` : ""}`}
    >
      {title !== undefined && <h2 className="font-semibold">{title}</h2>}
      {children}
    </div>
  );
}
