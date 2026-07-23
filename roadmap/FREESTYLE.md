# Freestyle mode

Just the raw device controls, exposed directly: speed, stroke length, valves —
no program, no engine, you drive. The simplest possible mode, and the one that
makes the device's own capabilities visible.

Open questions:

- **Voice** — continuous controls want discrete step words (`faster`/`slower`,
  `longer`/`shorter`), per the house rule; valves can be direct words.
- **Does it use the Player at all?** There's no program to play — it may talk
  to the device layer directly, which would make it the first mode outside the
  engine/Player shape. Or a trivial pass-through engine keeps the single-path
  invariant (one Player = mutual exclusion) intact.
- **Safe word** stays always-on, as everywhere.
