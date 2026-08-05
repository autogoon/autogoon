// The Inference tab's own routing. page.tsx picks the tab off the hash's first
// segment and ignores the rest, so everything after `#inference/` belongs to
// this screen: which pack's media is being labelled, which experiment is under
// examination, and which item is open for review.
//
//   #inference                              nothing chosen yet
//   #inference/<pack>                       that pack
//   #inference/<pack>/<experiment>          the summary
//   #inference/<pack>/<experiment>/<stem>   that item, open for review
//
// A hash naming neither is filled in from what was last selected (chosen.ts)
// and replaced, so the address always names both before anything is fetched.
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
  // Empty where the hash names none. choose() then fills it.
  pack: string;
  experiment: string;
  // Null on the summary screen.
  stem: string | null;
};

const NOTHING: InferenceRoute = { pack: '', experiment: '', stem: null };

const segment = (part: string | undefined): string =>
  part === undefined || part === '' ? '' : decodeURIComponent(part);

export function readRoute(hash: string): InferenceRoute {
  const [base, pack, experiment, ...rest] = hash.replace(/^#/, '').split('/');
  if (base !== TAB) return NOTHING;
  return {
    pack: segment(pack),
    experiment: segment(experiment),
    // Rejoined before decoding: a stem is encoded on the way out, so a slash in
    // one can't reach here split — but the corpus is a directory of arbitrary
    // filenames, and rejoining costs nothing to be sure of it.
    stem: rest.length === 0 ? null : decodeURIComponent(rest.join('/')),
  };
}

export function routeHash(
  pack: string,
  experiment: string,
  stem?: string | null,
): string {
  const at = `#${TAB}/${encodeURIComponent(pack)}/${encodeURIComponent(experiment)}`;
  return stem === undefined || stem === null
    ? at
    : `${at}/${encodeURIComponent(stem)}`;
}

// Moving between items replaces rather than pushes: walking a thousand of them
// would otherwise bury the summary a thousand entries back, and one press of
// back should leave review rather than undo a step.
export function goTo(
  pack: string,
  experiment: string,
  stem: string | null,
  { replace = false } = {},
): void {
  const url = routeHash(pack, experiment, stem);
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(CHANGED));
}

export function useRoute(): InferenceRoute {
  // Read after mount rather than from an initializer: this renders on the
  // server too, where there is no location to read.
  const [route, setRoute] = useState<InferenceRoute>(NOTHING);
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
