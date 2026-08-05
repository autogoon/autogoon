# Persona programs — a companion's traits driving the device

A companion's chat diverges by persona and their program does not: the
Companions engine generates the same shape whoever is talking, from an
`intensity` and a `variety` knob that start at the same defaults for everyone.
Deriving those two from persona traits is what would make a program theirs.

Which traits are code at all comes first. A trait earns a manifest field and a
mapping only if code reads it; one that colours how a companion behaves belongs
in the persona prompt, where an author can already write it:

- `chattiness` and `playfulness` are code, and shipped with ambient chat because
  they drive a timer;
- their **disposition** — who leads between them and the user — is settled in
  [modes/COMPANIONS.md](../modes/COMPANIONS.md): the persona prompt, not a code
  gate;
- `variety` may be prompt too, or may be the trait that sets the `variety` knob.

Settling that before adding fields matters because a manifest field is a
compatibility surface, and packs in the wild make one expensive to take back.

What this has to prove is that character bends both the chat and the generated
program. More than one companion, and the chooser to pick between them, have
shipped; what separates them is prompt-only until their programs diverge by
trait.
