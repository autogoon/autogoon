// A panel that opens beside something and stays on screen. Anything the review
// page opens over the rail uses it: the whole of a clipped answer, the two
// answers side by side, and it is what keeps a panel anchored to the bottom row
// from opening off the foot of the window.
//
// Positioned rather than styled into place, because `absolute` on the row can
// only be right where the row happens to sit. It measures itself once it is in
// the DOM, so the first paint is already in the right place.
//
// It lives here rather than in src/components/ because Inference is its only
// caller; nothing else in the app opens a panel beside a control.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

// Clear of the window's edges, and of the thing it is anchored to.
const GAP = 8;

type At = { top: number; left: number };

export function Floating({
  anchor,
  children,
  className = '',
  role,
  label,
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  role?: 'dialog';
  label?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<At | null>(null);

  // Below the anchor where it fits and above it where it doesn't, right-aligned
  // to the anchor and then pulled back inside the window. Whichever way it
  // goes, the whole panel is on screen.
  const place = useCallback(() => {
    const to = anchor.current;
    const box = panel.current?.getBoundingClientRect();
    if (to === undefined || to === null || box === undefined) return;
    const rect = to.getBoundingClientRect();
    const below = rect.bottom + GAP;
    setAt({
      top:
        below + box.height <= window.innerHeight - GAP
          ? below
          : Math.max(GAP, rect.top - GAP - box.height),
      left: Math.min(
        Math.max(GAP, rect.right - box.width),
        Math.max(GAP, window.innerWidth - GAP - box.width),
      ),
    });
  }, [anchor]);

  // Before paint, so nothing is ever seen in the corner it was measured in.
  useLayoutEffect(place, [place]);

  useEffect(() => {
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  return (
    <div
      ref={panel}
      role={role}
      aria-modal={role === 'dialog' ? true : undefined}
      aria-label={label}
      // Hidden rather than absent until it has been measured: it has to be laid
      // out to know how big it is.
      style={at ?? { top: 0, left: 0, visibility: 'hidden' }}
      className={`bg-background fixed z-30 max-w-[calc(100vw-1rem)] rounded-lg border p-3 shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}
