// A titled section — heading then stacked content, matching the home page's
// look (no border or box; whitespace does the separating). Pass `title` for the
// common heading-then-content layout, or omit it and lay the children out
// yourself. Pass `bordered` to frame it as a rounded, padded box (used for the
// debug/log panels). Still called Card: it's the unit the panels are built from.

import type { ReactNode } from "react";

export function Card({
  title,
  className,
  bordered = false,
  children,
}: {
  title?: string;
  className?: string;
  bordered?: boolean;
  children: ReactNode;
}) {
  const base = bordered
    ? "space-y-2 rounded-lg border border-foreground/15 bg-foreground/5 p-4"
    : "space-y-2";
  return (
    <div className={`${base}${className !== undefined ? ` ${className}` : ""}`}>
      {title !== undefined && <h2 className="font-semibold">{title}</h2>}
      {children}
    </div>
  );
}
