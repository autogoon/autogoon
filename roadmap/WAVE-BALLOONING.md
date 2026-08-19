# Wave — play-mode candidate

A long, high plateau with rolling swells that keep you near the top without
tipping over, also called ballooning. Distinct from edging: the point is the
undulation, not approaching and backing off an edge.

[Groove](../modes/GROOVE.md) can approximate the plateau today (Intensity full,
Dip variability off, Timing variability off → even 100 → 60 → 100 rolls, 20 s
per swell), which is enough to test whether the sensation is worth chasing. But
it stays short of a true Wave:

**The swells can't stay near the top** — Groove's floor is fixed at 60, and Dip
variability only ever draws it deeper. A true Wave swells between ~100 and 85;
Groove's shallowest dip drops 40% of the way to a standstill, so the
approximation reads as shallow edging.

**The swells can't be slowed from Groove's panel** — Timing variability only
shortens legs from the 10 s baseline, so 20 s is the longest swell period the
knobs reach. The Player's rate transport already stretches it — down to 0.25×,
so 80 s — but only Goon declares `faster` / `slower`.

So the build would be a **floor knob** that can rise toward the top, and slowing
the swells may be no more than declaring `faster` / `slower` on Groove's panel.
A floor knob on Groove would _be_ Wave, so this is a Groove extension rather
than a new engine.
