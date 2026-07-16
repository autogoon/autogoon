#!/bin/sh
# Regenerate the spoken-word fixtures used by the Playwright voice tests.
# macOS only (uses the system `say` synthesizer); the generated wavs are
# committed, so this only needs running when a fixture changes.
set -e
cd "$(dirname "$0")"

say -o autopilot.wav --data-format=LEI16@22050 "autopilot"
