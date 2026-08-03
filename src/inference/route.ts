// The Inference tab's own routing. page.tsx picks the tab off the hash's first
// segment and ignores the rest, so everything after `#inference/` belongs to
// this screen: which experiment is under examination, and which item is open
// for review.
//
//   #inference                        the summary, on whichever experiment the
//                                     registry names
//   #inference/<experiment>           the summary, on that experiment
//   #inference/<experiment>/<stem>    that item, open for review
//
// Review is a page rather than an overlay so an item can be linked, reloaded
// and left with the browser's own back — and so Escape belongs to whatever
// opens on top of it.

import { useEffect, useState } from 'react';

export const TAB = 'inference';

// Fired after this screen pushes a URL, because pushState raises no event of
// its own. A custom one rather than a synthesized popstate: page.tsx listens
// for popstate too, and pushing its own screen's hash back is not what a move
// inside a tab should provoke.
const CHANGED = 'inference:route';

export type InferenceRoute = {
  // Empty before anything has been chosen. The listing then answers for the
  // registry's CURRENT and names it.
  experiment: string;
  // Null on the summary screen.
  stem: string | null;
};

export function readRoute(hash: string): InferenceRoute {
  const [base, experiment, ...rest] = hash.replace(/^#/, '').split('/');
  if (base !== TAB || experiment === undefined || experiment === '') {
    return { experiment: '', stem: null };
  }
  return {
    experiment: decodeURIComponent(experiment),
    // Rejoined before decoding: a stem is encoded on the way out, so a slash in
    // one can't reach here split — but the corpus is a directory of arbitrary
    // filenames, and rejoining costs nothing to be sure of it.
    stem: rest.length === 0 ? null : decodeURIComponent(rest.join('/')),
  };
}

export const routeHash = (experiment: string, stem?: string | null): string =>
  stem === undefined || stem === null
    ? `#${TAB}/${encodeURIComponent(experiment)}`
    : `#${TAB}/${encodeURIComponent(experiment)}/${encodeURIComponent(stem)}`;

// Moving between items replaces rather than pushes: walking a thousand of them
// would otherwise bury the summary a thousand entries back, and one press of
// back should leave review rather than undo a step.
export function goTo(
  experiment: string,
  stem: string | null,
  { replace = false } = {},
): void {
  const url = routeHash(experiment, stem);
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(CHANGED));
}

export function useRoute(): InferenceRoute {
  // Read after mount rather than from an initializer: this renders on the
  // server too, where there is no location to read.
  const [route, setRoute] = useState<InferenceRoute>({
    experiment: '',
    stem: null,
  });
  useEffect(() => {
    const read = () => setRoute(readRoute(window.location.hash));
    read();
    // Three ways in: the back button (popstate), a link in the breadcrumb
    // (hashchange), and this screen's own navigation (CHANGED, since pushState
    // raises nothing).
    window.addEventListener('popstate', read);
    window.addEventListener('hashchange', read);
    window.addEventListener(CHANGED, read);
    return () => {
      window.removeEventListener('popstate', read);
      window.removeEventListener('hashchange', read);
      window.removeEventListener(CHANGED, read);
    };
  }, []);
  return route;
}
