# Theming

The app has a light theme and a mostly hard-coded palette. Nothing reconciles
the two, so a colour that fails in one theme is caught only by eye.

## How it works today

Two layers, and most of the UI sits in the second.

The token layer is real. `src/app/globals.css` defines a full shadcn-style set —
`--background`, `--foreground`, `--card`, `--muted-foreground`, `--border` and
the rest — twice, once under `:root` and once under `.dark`. `layout.tsx` wraps
the app in `next-themes`' `ThemeProvider` with `attribute="class"` and
`defaultTheme="system"`, and `theme-toggle.tsx` offers light, dark and system.
Anything written as `text-foreground` or `bg-card` follows the theme correctly.

The palette layer does not. Literal Tailwind palette classes —
`text-emerald-500`, `bg-blue-600`, `text-red-500`, `bg-*-800` — are used across
most of the components, and each is the same colour in both themes. To see the
spread as it stands:

```
grep -rE '(bg|text|border|ring)-[a-z]+-[0-9]{2,3}' src
```

On top of that, companion and play-mode accents are interpolated at render
(`bg-${accent}-500` in `chooser-card.tsx`) against the `@source inline(...)`
safelist in `globals.css`, which covers seventeen hues at shade 500 — and the
same seventeen at 600 for the segmented controls.

The two layers meet wherever a token-coloured foreground sits on a palette
background, and that pairing is only checked by looking at it. The changelog's
tag pills were `text-foreground` over `bg-*-800`: white-on-dark in the dark
theme, near-black-on-dark in the light one, for as long as the screen has
existed.

## What has to be decided

Whether light mode is a supported theme.

It is currently offered — a three-way toggle, and `system` as the default, so a
visitor whose OS is light gets it without choosing. The palette layer does not
support it.

## Dropping light mode

Force the dark class, drop the toggle, and collapse the `:root` token block into
one set. Every palette class becomes correct by definition: there is one theme,
and they were all chosen against it.

It costs the three-way toggle (a control with no voice word, so nothing in the
grammar changes) and the `system` default, which means a light-OS visitor gets a
dark app. For an app operated in the dark, hands-free, that may cost little.

## Tokenising the palette

Keep both themes and give the palette semantic tokens — an accent set, a status
set (success, warning, danger) — defined per theme like the existing ones, so
`text-emerald-500` names a role rather than a hue.

It costs a pass over every component that names a colour, and a decision about
the accent system: seventeen hues at one shade works because every accent sits
on a dark surface, and a light surface needs a second shade per hue or a
different treatment. The safelist doubles with it. What it buys is that the
pairing that broke the changelog pills stops being possible, rather than being
fixed one pill at a time.

## Either way

Neither branch gives a check that catches the next bad pairing automatically. A
contrast check over the rendered pairs is its own piece of work and is worth
considering on top of whichever branch is taken — it is the only thing here that
would have reported the pills without someone opening the screen in a light
theme.
