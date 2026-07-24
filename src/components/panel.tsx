// A screen's top-level layout — its cards stacked in one column with the
// app's between-cards rhythm. Every screen renders one of these; the gap
// between cards lives here, not per screen (Card owns only its insides).

import type { ReactNode } from "react";

export function Panel({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-8">{children}</section>;
}
