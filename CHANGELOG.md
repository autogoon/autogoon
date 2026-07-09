# Changelog

## 2026-07-09

- feature: Groove has a new Dip variability control — every dip now falls to a randomly drawn depth instead of the same one each time. Pick Off/Low/Medium/High, or say `flatter` / `hillier`. ([#6](https://github.com/autogoon/autogoon/pull/6))
- feature: Settings now has an Info card showing what's live — the deployed commit (linked to its page on GitHub) and when the build was made, in the user's local time. ([#5](https://github.com/autogoon/autogoon/pull/5))
- enhancement: Groove's dips feel less mechanical: each rise and fall now takes a randomly drawn length of time rather than a fixed one, and the speed eases into the bottom of a dip instead of stepping evenly, so slow speeds change more gently. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: Groove's Intensity now scales the pattern evenly, so turning it down no longer flattens deep dips into shallow ones. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: In Groove, the Speed card is now Intensity and steps with `more` / `less`, matching Goon and Autopilot — `faster` / `slower` now only ever means playback speed. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: Goon's build now winds Groove's Dip and Timing variability down from high to off across its first 25 minutes, then flattens the dip away over the last 5. It opens with deep, ragged swings that can drop you to a standstill rather than dipping to the same depth every time, and eases into the hold at the top instead of arriving there abruptly. ([#7](https://github.com/autogoon/autogoon/pull/7))
- enhancement: Goon's Intensity now scales the build evenly, so turning it down no longer squashes the dips into a narrow band near the top. ([#7](https://github.com/autogoon/autogoon/pull/7))
- enhancement: The timeline preview draws a ramp as a smooth slope instead of a staircase, so a rise or fall reads as one movement rather than a run of tiny steps. Genuine holds are still drawn as steps. ([#7](https://github.com/autogoon/autogoon/pull/7))
- enhancement: Goon's Intensity card now sits directly under the stroke controls rather than below the timeline, putting the control you reach for most within easier reach. ([#6](https://github.com/autogoon/autogoon/pull/6))

## 2026-07-08

- feature: The timeline preview now shows upcoming stroke and suction pulses, not just speed. ([#2](https://github.com/autogoon/autogoon/pull/2))
- feature: Stop now pauses and holds your place — Start picks up where you left off. ([#1](https://github.com/autogoon/autogoon/pull/1))
- feature: New Reset command (button or voice) to clear back to a fresh session. ([#1](https://github.com/autogoon/autogoon/pull/1))
- feature: The program previews live before you press Start, so you can adjust it first. ([#1](https://github.com/autogoon/autogoon/pull/1))
- enhancement: The sparkline preview and Goon's timeline now follow the playback speed — Goon's 30-minute build reads 7:30 at 4×, and the preview looks further ahead at higher speeds so it never runs out of curve. ([#2](https://github.com/autogoon/autogoon/pull/2))
- enhancement: On-screen buttons light up when you say their voice command, and now flash when you click them too. ([#2](https://github.com/autogoon/autogoon/pull/2))
- enhancement: Voice now controls anything you can use on screen, not just while running. ([#1](https://github.com/autogoon/autogoon/pull/1))
- enhancement: Finish and Cumming are now visually distinct — Finish amber (the pre-ending), Cumming red (the send-off) — instead of two identical buttons. ([#4](https://github.com/autogoon/autogoon/pull/4))
- enhancement: Manual stroke and the cumming/finish commands work any time a device is connected. ([#1](https://github.com/autogoon/autogoon/pull/1))
- bug: In Autopilot, changing Vacuum Maintenance had no effect on what you felt; it now reshapes the upcoming suction pulses straight away. ([#2](https://github.com/autogoon/autogoon/pull/2))
- bug: Goon's Finish button could be triggered with no device connected; it's now disabled until you connect. ([#2](https://github.com/autogoon/autogoon/pull/2))
- internal: Renamed the Start/Stop/Reset control `RunButton` → `SessionControls`, and moved Finish/Cumming out of the shared `StrokeCard` into dedicated `FinishButton`/`CummingButton` components each panel renders itself, leaving `StrokeCard` as just the shared stroke ± buttons. ([#4](https://github.com/autogoon/autogoon/pull/4))
- internal: Added an "Adding an algorithm" guide to DEVELOPERS.md (step-by-step checklist, the knob→device method table, and the `generateSpeed` pitfalls), pointed at Goon as the reference to copy, and made the algorithm tab list derive from a single `TABS` source in `page.tsx` so a new mode's voice switch word and tab lock can't be silently forgotten. ([#4](https://github.com/autogoon/autogoon/pull/4))
- internal: Engine generation is split into a speed backbone (`generateSpeed`) and a pure valve overlay (`generateValves`), so the Player can re-lay valves over an unchanged speed script via `invalidateValves()`. ([#2](https://github.com/autogoon/autogoon/pull/2))
- internal: Each algorithm is now an engine plus a panel, dropping the per-algorithm hooks and the runner; mutual exclusion is a Player invariant. ([#2](https://github.com/autogoon/autogoon/pull/2))
