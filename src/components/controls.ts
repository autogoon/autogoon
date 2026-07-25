// The shared look of SMALL interactive controls — utility buttons (Connect,
// Test, the header chips) and text inputs. On the flat, borderless pages these
// need their own lift to be visible at rest: a subtle fill plus a border
// brighter than the theme's hairline --border.
//
// The border COLOUR is a separate token (CONTROL_BORDER): a caller showing a
// state colour (the Connect button's connected emerald, an error's red) uses
// CONTROL_BUTTON_BASE and picks exactly one border colour itself — two
// border-colour utilities on one element would be resolved by stylesheet
// order, not by intent. Large action buttons (Start/Stop/Play, cumming/finish,
// the stroke pair) keep their own loud styling and don't use these.

export const CONTROL_BORDER = 'border-foreground/30';

export const CONTROL_BUTTON_BASE =
  'rounded-lg border bg-secondary/70 px-3 py-2 text-sm enabled:hover:bg-secondary disabled:opacity-50';

export const CONTROL_BUTTON = `${CONTROL_BUTTON_BASE} ${CONTROL_BORDER}`;

export const CONTROL_INPUT = `rounded-lg border ${CONTROL_BORDER} bg-secondary/40 px-3 py-2`;
