# Other devices, and no device

The app is one device: the Autoblow Vacuglide, driven through its cloud API
([`src/lib/vacuglide-device.ts`](../src/lib/vacuglide-device.ts)). Everything
above that assumes the same device's controls — the engines and the Player
generate speed plus two valves, the companion tools set an intensity percent and
a variety level, and the shared `CONTROL_SECTION` in
[`src/lib/companions/shared-prompt.ts`](../src/lib/companions/shared-prompt.ts)
describes a suction sleeve by name and tells a companion it runs itself.

Two widenings, and the second is much bigger than it looks:

- **Other strokers.** There are plenty, and they don't share a control surface
  or a transport.
- **No device at all** — chat to the companions and use your hand. This is the
  crucial one. It's the largest widening of who can use the app, it needs no
  hardware to try, and it's the case that most tests whether the persona format
  is really device-neutral.

Open questions:

- **What's actually common across devices?** An intensity a companion can raise
  and lower probably travels everywhere. Stroke length travels to some. The
  Vacuglide's valves are its own. So either the abstraction is the small common
  core and richer devices expose extras, or every device gets its own control
  vocabulary and the layers above have to cope — which is the same question the
  prompts face below, one level down.
- **Transport, and whether to hand it off.** The Vacuglide is a cloud HTTP API;
  most other devices are local BLE. Worth evaluating an off-the-shelf normaliser
  (Intiface / buttplug.io already speaks to a long list of devices) against
  per-device clients in the shape of the current one.
- **One control prompt per device.** The mechanism for this already exists:
  `CONTROL_SECTION` is app-owned and pulled into a persona by a `{{…}}` token
  (see [GOONPACKS.md](../GOONPACKS.md)), so swapping in a per-device variant
  costs packs nothing and needs no rewrite. The hand needs no control section at
  all — there's nothing to start, stop or set.
- **The tools change shape, or disappear entirely.** The companion tools are cut
  to this device (an intensity percent, a variety level), so another device
  means another set. With no device there are no control tools and no TOY STATUS
  line — and that line is currently the companion's ground truth about the
  device. A companion whose whole appetite is driving the toy then has to work
  by instruction and trust instead, which is a different disposition, not a
  missing section.
- **Can one persona be device-neutral, or is it a version per device?** The
  crux, and the reason this is a roadmap item rather than a task. The shared
  sections swap cleanly; a pack's _own_ disposition bullets are the problem,
  because they are written against a controllable toy — "set it where you want
  him", "drop him to nothing mid-sentence". Rewritten for a hand, those become
  instructions to him, which reads differently even when the character is
  identical. Candidate answers, none settled: neutral wording plus per-device
  shared sections; a second token so a pack can ship a device-facing block per
  device; a manifest field declaring which devices a pack supports; or a
  per-device overlay, since an overlay can already replace the persona prompt.
  This wants prototyping before designing — write one companion three ways
  (Vacuglide, another stroker, hand only) and see how much genuinely survives in
  common.
- **The play modes without a device.** Goon, Groove and Autopilot exist to
  generate a program for hardware, and Autopilot is a faithful recreation of
  Autoblow's Autopilot, so it can't travel to another device either. With no
  device there's nothing to play at all, which suggests hand mode is
  Companions-only — and then navigation, the play-mode registry and the global
  voice words all have to say so rather than offering modes that can't run.
- **What the Player is for** when there's no device to send to. It owns the
  clock, the tick loop and transport; with nothing on the other end, either it
  isn't in the picture or hand mode is genuinely a different path through the
  app.
- **Vocabulary.** The prompts and docs say "the toy", and `CONTROL_SECTION`
  names the hardware outright. Whatever lands has to leave every companion able
  to refer to what he's using without the app having lied to them about it.
- **The safe word** is always on, but with no program running it has nothing to
  stop — which is the same gap the safeword-as-hard-stop item in
  [TODO.md](../TODO.md) is about, reached from a different direction.
