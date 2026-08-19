# Cumming patterns

What happens from the moment you say you're cumming is bespoke code today. Goon
has four outcomes, Groove and Companions have a hardcoded wind-down apiece, and
Autopilot has nothing.

The idea is that **every cumming pattern is definable** — the four that exist,
and the ones nobody has thought of yet. They'd be shareable, you'd pick which
one ends a play mode, and a companion could pick one when you say you're
cumming.

**How a pattern gets written down is the open question.** It would need to
cover:

- a ruin (a burst at a fixed speed with the stroke+ valve open, or a dead stop
  with both valves closed);
- torture (a hold with no end);
- shaped curves.

**Whether a companion can use all of them.** Once patterns can be imported
you'll have some you brought in to try and don't want used. "Active" may need to
mean more than "installed", or a companion may need a narrower set than the one
you'd pick from yourself.

**Nothing makes a pattern's description true.** An imported pattern's title and
description are whatever its author typed; what it actually does is the data. So
what you see before enabling one should be a `Sparkline` of the pattern itself,
alongside the title and description. Keep the metadata to exactly those, too:
every extra field is another thing that has to be trusted, checked or displayed.

**A pattern's description is appended to the system prompt.** This is not a
security concern. A goonpack already hands its author the whole system prompt,
so this is a much smaller version of something the app accepts by design. But a
companion choosing between patterns reads their descriptions, and whatever is
written there colours how they think about them.

Worth a note in the importer: describe the pattern, nothing else. Even a line
about when to use it ("perfect for when he's begging") is something they'll take
as direction.
