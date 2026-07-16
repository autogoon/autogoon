# Changelog

## 2026-07-16

- feature: There is now a safe word — saying it while anything is playing always stops the device instantly, on every algorithm, exactly like Stop (nothing is reset). It defaults to `pineapple` and can be changed under Settings or on Goon's setup view, with a Test button that narrows the recogniser to just that word so you can check it's actually recognisable before relying on it. Unlike `stop`, which belongs to the algorithm, the safe word can never be disabled. ([#9](https://github.com/autogoon/autogoon/pull/9))
- feature: The algorithm tabs are gone — the app now opens on a home screen: device connection, the algorithm chooser (say one's name, or tap it, to enter) and getting-started steps, with Settings as a tab beside home (appearance, build info). Inside an algorithm, Exit (the breadcrumb, the spoken word, or the browser's back button) returns home; all of them are locked while a session runs, so you still can't switch algorithms mid-session. Reloading the page lands you back on the screen you were on.
- feature: Goon now opens on a setup view: choose your session length (10–120 minutes, default 30 — say `shorter` / `longer` to step it) and hit Play (or say it). The build scales to fit — a 15-minute session compresses the ramp, an hour-long one stretches it. Setup and play are separate levels (Home › Goon › Play): setup choices lock once you're playing, Reset restarts the session from time 0, and Exit climbs back up to setup.
- enhancement: The "Listening for" bar is gone from every algorithm screen — the voice words are shown on the buttons and cards themselves, and the breadcrumb hints at `exit`.
- enhancement: Goon's automatic teasing is now just a single 10-second stroke− application at session start — the every-minute stroke− pulses and the five-minutely stroke+ pulses are gone.
- enhancement: The whole app now wears the home screen's flat look — the boxed cards are gone (headings and whitespace do the separating), Start and Play are one calm blue everywhere, the Stroke −/+ buttons wear a cyan tint instead of black, and the algorithm chooser entries carry a big colour-coded icon on a soft diagonal tint of the same colour. Small controls — the token and safe word inputs, Test, Connect and the header chips — share a single lifted style so they stand out on the dark background. ([#9](https://github.com/autogoon/autogoon/pull/9))
- enhancement: Manual strokes now yield to the program's own: while an algorithm holds a valve open (a suction pulse, a tease, an ending), the Stroke buttons and `up`/`down` words disable, and a scheduled stroke arriving mid-press releases your stroke first — the release always fires — then takes over. A ruin or torture ending can no longer be interfered with. ([#10](https://github.com/autogoon/autogoon/pull/10))
- bug: A manual stroke pulse (`up`/`down`) now rides the running program as real events instead of a wall-clock timer — its length stays true at any playback speed, and its release can no longer be lost to a knob change mid-pulse. ([#10](https://github.com/autogoon/autogoon/pull/10))
- bug: Autopilot's vacuum maintenance now works like the original: a suction pulse fires only when the speed steps, with the Low/High interval as a minimum gap between pulses — not on a fixed 2–3 second repeat, which applied far more suction than the real autopilot. ([#10](https://github.com/autogoon/autogoon/pull/10))
- bug: Coloured borders never actually rendered — a base stylesheet rule outranked every Tailwind border-colour utility, so the Connect button's connected green (and every other coloured border) showed as grey. ([#9](https://github.com/autogoon/autogoon/pull/9))

- internal: Added the first test suites: Jest unit tests for the device client's rate-limit accounting and the Goon engine's generation contract, and a Playwright end-to-end voice test that plays a synthesized "autopilot" through a stubbed microphone and asserts the tab switches — run against real Chromium, Firefox, and WebKit. ([#8](https://github.com/autogoon/autogoon/pull/8))

## 2026-07-14

- enhancement: Goon's dips now keep some unevenness in their timing right to the end of the build, instead of settling into a metronome at 25 minutes. The pace slackens off gradually across the whole 30 minutes, so only the last few dips run at their full, unhurried length. ([#7](https://github.com/autogoon/autogoon/pull/7))

## 2026-07-09

- feature: Groove has a new Dip variability control — every dip now falls to a randomly drawn depth instead of the same one each time. Pick Off/Low/Medium/High, or say `flatter` / `hillier`. ([#6](https://github.com/autogoon/autogoon/pull/6))
- feature: Settings now has an Info card showing what's live — the deployed commit (linked to its page on GitHub) and when the build was made, in the user's local time. ([#5](https://github.com/autogoon/autogoon/pull/5))
- enhancement: Groove's dips feel less mechanical: each rise and fall now takes a randomly drawn length of time rather than a fixed one, and the speed eases into the bottom of a dip instead of stepping evenly, so slow speeds change more gently. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: Groove's Intensity now scales the pattern evenly, so turning it down no longer flattens deep dips into shallow ones. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: In Groove, the Speed card is now Intensity and steps with `more` / `less`, matching Goon and Autopilot — `faster` / `slower` now only ever means playback speed. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: Goon's build now winds Groove's Dip and Timing variability down from high to off across its first 25 minutes, then flattens the dip away over the last 5. It opens with deep, ragged swings that can drop you to a standstill rather than dipping to the same depth every time, and eases into the hold at the top instead of arriving there abruptly. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: Goon's Intensity now scales the build evenly, so turning it down no longer squashes the dips into a narrow band near the top. ([#6](https://github.com/autogoon/autogoon/pull/6))
- enhancement: The timeline preview draws a ramp as a smooth slope instead of a staircase, so a rise or fall reads as one movement rather than a run of tiny steps. Genuine holds are still drawn as steps. ([#6](https://github.com/autogoon/autogoon/pull/6))
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
