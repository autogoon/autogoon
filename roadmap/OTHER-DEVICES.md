# Other devices, and no device

The app is one device, the Autoblow Vacuglide, driven through its cloud API
([`src/lib/vacuglide-device.ts`](../src/lib/vacuglide-device.ts)). Everything
above that assumes the same device's controls:

- The engines and the Player generate speed plus two valves.
- The companion tools set an intensity percent and a variety level.
- The shared `CONTROL_SECTION` in
  [`src/lib/companions/shared-prompt.ts`](../src/lib/companions/shared-prompt.ts)
  describes a suction sleeve by name and tells a companion it runs itself.

Two widenings:

- **Other strokers.** There are plenty. They don't share a control surface or a
  transport.
- **No device at all** — chat to the companions and use your hand. It is the
  largest widening of who can use the app, and it needs no hardware to try. It
  also tests hardest whether the persona format is device-neutral.

Open questions:

- **What's common across devices?** An intensity a companion can raise and lower
  probably travels everywhere. Stroke length travels to some. The Vacuglide's
  valves are its own. So either the abstraction is the small common core and
  richer devices expose extras, or every device gets its own control vocabulary
  and the layers above have to cope. **One control prompt per device** faces the
  same question, one level down.
- **Transport, and whether to hand it off.** The Vacuglide is a cloud HTTP API;
  most other devices are local BLE. Worth evaluating an off-the-shelf normaliser
  (Intiface / buttplug.io already speaks to a long list of devices) against
  per-device clients in the shape of the current one.
- **One control prompt per device.** The mechanism already exists.
  `CONTROL_SECTION` is app-owned and pulled into a persona by a `{{…}}` token
  (see [GOONPACKS.md](../GOONPACKS.md)). A per-device variant swaps in at no
  cost to packs. The hand needs no control section at all. There is nothing to
  start, stop or set.
- **The tools change shape, or disappear entirely.** The companion tools are cut
  to this device. Another device means another set. With no device there are no
  control tools and no TOY STATUS line. That line is currently the companion's
  ground truth about the device. A companion whose whole appetite is driving the
  toy then has to work by instruction and trust instead. That is a different
  disposition, not a missing section.
- **Can one persona be device-neutral, or is it a version per device?** The
  crux, and the reason this is a roadmap item rather than a task. The shared
  sections swap cleanly. A pack's _own_ disposition bullets are the problem,
  because they are written against a controllable toy — "set it where you want
  him", "drop him to nothing mid-sentence". Rewritten for a hand, those become
  instructions to him, and read differently even when the character is
  identical. Candidate answers, none settled:

  - Neutral wording plus per-device shared sections.
  - A second token, so a pack can ship a device-facing block per device.
  - A manifest field declaring which devices a pack supports.
  - A per-device overlay, since an overlay can already replace the persona
    prompt.

  Prototype this before designing it. Write one companion three ways (Vacuglide,
  another stroker, hand only) and see how much survives in common.

- **A pack that is device-bound on purpose.** Asking whether a persona can be
  device-neutral assumes every author is writing for that, and some are not:
  where the device is part of who the companion is — why they chose him, what
  the scene is arranged around — rewriting it for a hand produces a different
  character, not the same one with a section swapped. So the manifest field is
  wanted from both sides: a neutral pack declaring its reach, a bound pack
  declaring what it requires, and the app hiding or refusing one it can't
  satisfy. [GOONPACKS.md](../GOONPACKS.md) tells pack authors not to name the
  device or assume there is one, and would need to say when a pack may.

- **The play modes without a device.** Goon, Groove and Autopilot exist to
  generate a program for hardware. Autopilot is a faithful recreation of
  Autoblow's Autopilot. It can't travel to another device either. With no device
  there is nothing to play at all. That suggests hand mode is Companions-only.
  Navigation, the play-mode registry and the global voice words would then all
  have to say so, rather than offering modes that can't run.
- **What the Player is for** when there's no device to send to. It owns the
  clock, the tick loop and transport. With nothing on the other end, either it
  isn't in the picture or hand mode is a different path through the app.
- **Vocabulary.** The prompts and docs say "the toy", and `CONTROL_SECTION`
  names the hardware outright. Whatever lands has to leave every companion able
  to refer to what the user is using without the app having told them something
  untrue about it.
- **The safe word** is always on, but with no program running it has nothing to
  stop. [The safe word](./SAFE-WORD.md) is the same gap, reached from a
  different direction.
