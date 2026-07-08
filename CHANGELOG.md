# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Reset** command (button + voice). While stopped, Reset restores the current
  algorithm's knobs to their defaults and regenerates a fresh program. Reset needs
  no device, so it works while disconnected.
- **Live program preview before Start.** Each algorithm's program is now built
  when its tab becomes visible (not on Start), so the sparkline is populated
  immediately and you can scrub/adjust it before playing.

### Changed

- **Stop is now a pause.** Stop halts the device but holds your position; the next
  Start **resumes** from there instead of restarting from the beginning. The
  transport is a single three-state model — `armed` / `playing` / `paused` — owned
  by the shared Player. A session in progress (playing or paused) locks the other
  algorithm tabs.
- **Voice follows the usable controls.** A single `enabled` flag per command is
  the source of truth for the keyword-spotter grammar, the dispatcher, and the
  matching button's disabled state, so voice and UI can never disagree. Voice now
  drives any control that's usable on the current tab, not only while running.
- **Manual stroke (`up` / `down`) is valid whenever a device is connected**,
  in play or not (was gated on playing). Likewise the ending commands
  (`cumming` / `finish`) are valid whenever connected.

### Fixed

- Voice `reset` is recognised while the device is disconnected (it was missing
  from the grammar in that state even though the button worked).
- Algorithm knob commands spoken while armed (e.g. Autopilot's `light`) now take
  effect instead of being recognised but ignored.
