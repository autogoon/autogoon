# Changelog

## 2026-07-08

- feature: The timeline preview now shows upcoming stroke and suction pulses, not just speed. ([#2](https://github.com/autogoon/autogoon/pull/2))
- feature: Stop now pauses and holds your place — Start picks up where you left off. ([#1](https://github.com/autogoon/autogoon/pull/1))
- feature: New Reset command (button or voice) to clear back to a fresh session. ([#1](https://github.com/autogoon/autogoon/pull/1))
- feature: The program previews live before you press Start, so you can adjust it first. ([#1](https://github.com/autogoon/autogoon/pull/1))
- enhancement: The sparkline preview and Goon's timeline now follow the playback speed — Goon's 30-minute build reads 7:30 at 4×, and the preview looks further ahead at higher speeds so it never runs out of curve. ([#2](https://github.com/autogoon/autogoon/pull/2))
- enhancement: On-screen buttons light up when you say their voice command, and now flash when you click them too. ([#2](https://github.com/autogoon/autogoon/pull/2))
- enhancement: Voice now controls anything you can use on screen, not just while running. ([#1](https://github.com/autogoon/autogoon/pull/1))
- enhancement: Manual stroke and the cumming/finish commands work any time a device is connected. ([#1](https://github.com/autogoon/autogoon/pull/1))
- bug: In Autopilot, changing Vacuum Maintenance had no effect on what you felt; it now reshapes the upcoming suction pulses straight away. ([#2](https://github.com/autogoon/autogoon/pull/2))
- bug: Goon's Finish button could be triggered with no device connected; it's now disabled until you connect. ([#2](https://github.com/autogoon/autogoon/pull/2))
- internal: Documented the git workflow and the pre-commit checks (typecheck/lint/format) in CLAUDE.md and DEVELOPERS.md. ([#3](https://github.com/autogoon/autogoon/pull/3))
- internal: Engine generation is split into a speed backbone (`generateSpeed`) and a pure valve overlay (`generateValves`), so the Player can re-lay valves over an unchanged speed script via `invalidateValves()`. ([#2](https://github.com/autogoon/autogoon/pull/2))
- internal: Each algorithm is now an engine plus a panel, dropping the per-algorithm hooks and the runner; mutual exclusion is a Player invariant. ([#2](https://github.com/autogoon/autogoon/pull/2))
