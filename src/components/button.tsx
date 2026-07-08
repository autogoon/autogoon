"use client";

// A plain <button> with an optional voice-command badge. The badge shows, in
// the corner, the keyword you can say to trigger the button (see the keyword
// spotter). With no badge it renders exactly like a native button — every prop
// passes straight through and the markup is unchanged.

import type { ComponentProps } from "react";

export function Button({
  badge,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { badge?: string }) {
  if (badge === undefined) {
    return (
      <button {...props} className={className}>
        {children}
      </button>
    );
  }
  return (
    <button {...props} className={`relative ${className ?? ""}`}>
      {children}
      <span className="text-muted-foreground bg-background pointer-events-none absolute top-1 right-1 rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
        {badge}
      </span>
    </button>
  );
}
