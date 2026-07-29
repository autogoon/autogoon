# Freestyle mode

Just the raw device controls: speed, stroke length, valves — no program, no
engine, you drive.

Open questions:

- **Voice** — continuous controls get discrete step words (`faster`/`slower`,
  `longer`/`shorter`), per Voice-first in
  [CLAUDE.md](../CLAUDE.md#architecture); valves can be direct words.
- **Does it use the Player at all?** There's no program to play — it may talk to
  the device layer directly, which would make it the first mode outside the
  engine/Player shape. Or a trivial pass-through engine keeps the single-path
  invariant (one Player = mutual exclusion) intact.
- **Safe word** stays always-on, as everywhere.
