"use client";

// Goon algorithm panel. Owns the Goon engine, arms/plays the shared Player with
// it, and declares its commands once (button == voice). Presentation + wiring;
// event generation lives in @/lib/algorithms/goon-engine.
//
// The panel has two views, which are separate navigation levels (the page owns
// which one shows, via the `view` prop — Home › Goon is setup, Home › Goon ›
// Play is play):
//   - setup — setup options (one card per concern) and a Play button, with a
//     small grammar of its own (`shorter` / `longer` / `play`). Play commits
//     the settings, arms the engine, and navigates to the play view.
//   - play — the live session: transport, preview, stroke, intensity, timeline.
//     Setup choices are deliberately locked here; Reset re-arms from time 0 and
//     stays put, while exit (page-owned) walks back up to setup.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CummingButton } from "@/components/cumming-button";
import { FinishButton } from "@/components/finish-button";
import { LogCard } from "@/components/log-card";
import { RateLimitMeter } from "@/components/rate-limit-meter";
import { SafeWordField } from "@/components/safe-word-field";
import { SessionControls } from "@/components/session-controls";
import { Slider } from "@/components/slider";
import { Sparkline } from "@/components/sparkline";
import { StrokeCard } from "@/components/stroke-card";
import type { PlayerView } from "@/hooks/use-player";
import { useStrokeControls } from "@/hooks/use-stroke-controls";
import { useVoiceCommands, type Command } from "@/hooks/use-voice-commands";
import type { VacuglideDeviceController } from "@/hooks/use-vacuglide-device";
import {
  GoonEngine,
  DEFAULT_PROGRAM_MS,
  AFTER_PLAY_OPTIONS,
  type AfterPlayOption,
} from "@/lib/algorithms/goon-engine";
import { JUMP_MS } from "@/lib/program";
import { formatMs } from "@/lib/format";
import { AFTER_PLAY_WORDS, AfterPlayCard } from "./after-play-card";
import {
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  SESSION_STEP_MINUTES,
  SessionLengthCard,
} from "./session-length-card";

const DEFAULT_INTENSITY = 50;
const INTENSITY_STEP = 10;
const DEFAULT_SESSION_MINUTES = DEFAULT_PROGRAM_MS / 60_000;
// Wind-down alone by default — the behaviour Goon has always had; the darker
// outcomes are opt-in.
const DEFAULT_AFTER_PLAY: AfterPlayOption[] = ["wind-down"];
// The ticked set persists across visits. Keyed per algorithm ("goon") on
// purpose: a future softer or harsher algorithm with after-play will want its
// own set, not a shared one.
const AFTER_PLAY_STORAGE_KEY = "goonAfterPlay";

export function GoonPanel({
  vacuglide,
  player,
  active,
  view,
  onEnterPlay,
  safeWord,
  sanitizeSafeWord,
  onSaveSafeWord,
}: {
  vacuglide: VacuglideDeviceController;
  player: PlayerView;
  active: boolean;
  view: "setup" | "play";
  onEnterPlay: () => void;
  // The app-wide safe word (owned by the page, also editable in Settings),
  // surfaced in Goon's setup so you see — and can change — it before playing.
  safeWord: string;
  sanitizeSafeWord: (input: string) => string | null;
  onSaveSafeWord: (word: string) => void;
}) {
  const device = vacuglide.player;
  const stroke = useStrokeControls(vacuglide, player);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  const [sessionMinutes, setSessionMinutes] = useState(DEFAULT_SESSION_MINUTES);
  // Setup: which after-play outcomes are in the hat. Play: the one drawn at
  // the cumming point (null until then) — the panel needs it because every
  // outcome except the wind-down ignores Stop once it starts.
  const [afterPlayOptions, setAfterPlayOptions] =
    useState<AfterPlayOption[]>(DEFAULT_AFTER_PLAY);
  const [afterPlay, setAfterPlay] = useState<AfterPlayOption | null>(null);

  // A stable engine identity for the panel's lifetime. The Player identifies its
  // active source by reference (`player.source === engine`, just below), so this
  // must never be re-created on render — a `useMemo` with deps would silently
  // break active-source detection when it recomputed.
  const engineRef = useRef<GoonEngine | null>(null);
  engineRef.current ??= new GoonEngine(DEFAULT_INTENSITY);
  const engine = engineRef.current;

  // Goon's slice of the shared player, derived from the view. The play-view
  // controls need both to be true: this is the play level AND Goon still holds
  // the Player (isCurrent alone isn't enough — the engine stays armed when you
  // exit back to setup).
  const isCurrent = player.source === engine;
  const inPlay = view === "play";
  const state = isCurrent ? player.state : "armed";
  const sessionMs = sessionMinutes * 60_000;

  // The setup -> play boundary: commit the setup choices to the engine, arm
  // (always afresh — re-entering play is a new session), and navigate down to
  // the play level. Gated on connection (like Start) — there's no play without
  // a device — and on at least one after-play outcome being ticked.
  const enterPlay = useCallback(() => {
    engine.setProgramMs(sessionMinutes * 60_000);
    engine.setAfterPlayOptions(afterPlayOptions);
    setAfterPlay(null);
    device.arm(engine);
    onEnterPlay();
  }, [device, engine, sessionMinutes, afterPlayOptions, onEnterPlay]);

  // Restore the remembered after-play set. In an effect (not a lazy
  // initializer) so server and first client render agree — the same pattern as
  // the device token. Anything unrecognised in storage is dropped; an empty or
  // unparsable value keeps the default.
  useEffect(() => {
    const stored = localStorage.getItem(AFTER_PLAY_STORAGE_KEY);
    if (stored === null) return;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      const valid = AFTER_PLAY_OPTIONS.filter((o) => parsed.includes(o));
      if (valid.length > 0) setAfterPlayOptions(valid);
    } catch {
      // Bad JSON — keep the default.
    }
  }, []);

  const toggleAfterPlay = useCallback(
    (option: AfterPlayOption, on: boolean) => {
      // Filtering the canonical list keeps the set in display order.
      const next = on
        ? AFTER_PLAY_OPTIONS.filter(
            (o) => o === option || afterPlayOptions.includes(o),
          )
        : afterPlayOptions.filter((o) => o !== option);
      setAfterPlayOptions(next);
      localStorage.setItem(AFTER_PLAY_STORAGE_KEY, JSON.stringify(next));
    },
    [afterPlayOptions],
  );

  const stepSessionMinutes = useCallback(
    (delta: number) =>
      setSessionMinutes((minutes) =>
        Math.max(
          MIN_SESSION_MINUTES,
          Math.min(MAX_SESSION_MINUTES, minutes + delta),
        ),
      ),
    [],
  );

  const start = useCallback(() => {
    device.play();
  }, [device]);
  const stop = useCallback(() => {
    void device.pause();
  }, [device]);
  // Reset stays on the play view: restore the live knobs and re-arm, putting
  // the program back at time 0. Setup choices are untouched (they're a level
  // up — exit to change them). Any drawn after-play is void — a fresh session
  // draws its own.
  const reset = useCallback(() => {
    setIntensity(DEFAULT_INTENSITY);
    engine.setIntensity(DEFAULT_INTENSITY);
    setAfterPlay(null);
    device.arm(engine);
  }, [device, engine]);

  const changeIntensity = useCallback(
    (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      setIntensity(clamped);
      engine.setIntensity(clamped);
      // Magnitude knob: intensity is applied in the engine's scale(), which the
      // Player runs every tick — so refresh() just re-sends the current speed at
      // the new ceiling. No need to regenerate the speed script.
      device.refresh();
    },
    [device, engine],
  );
  const stepIntensity = useCallback(
    (delta: number) => changeIntensity(intensity + delta),
    [intensity, changeIntensity],
  );

  const cumming = useCallback(() => {
    try {
      const drawn = engine.beginCumming();
      setAfterPlay(drawn);
      vacuglide.log(`after-play drawn: ${drawn}`);
      device.invalidateFuture();
      // Ending actions can arrive before Start — something may be happening
      // outside the app — so they start the clock themselves.
      device.play();
    } catch (err) {
      vacuglide.log(`error: ${(err as Error).message}`, "error");
    }
  }, [device, engine, vacuglide]);

  // Finish = jump to the end-of-build hold, starting the clock if it isn't
  // already running (see cumming).
  const finish = useCallback(() => {
    device.seekTo(sessionMs);
    device.play();
  }, [device, sessionMs]);

  const connected = vacuglide.connected;
  // Ending actions (cumming, and Finish = jump to the end of the build) need a
  // device. Scrubbing the timeline (±1 min, faster/slower) and the intensity knob
  // only shape the preview, so they're valid whenever the play view is up with
  // Goon as the current source — connected or not.
  const live = inPlay && isCurrent;
  // Once an after-play other than the wind-down has been drawn, it can't be
  // avoided: Stop and every transport control that could dodge or dilute the
  // outcome are withdrawn. The page-owned safe word bypasses all of this.
  const unstoppable = afterPlay !== null && afterPlay !== "wind-down";
  // And while such an outcome is actually playing, the panel ignores you
  // entirely — every remaining command (word and button alike) is withdrawn
  // too, so only the safe word gets a hearing. Once the safe word has halted
  // it (state leaves "playing"), Reset and Start come back.
  const lockedOut = unstoppable && state === "playing";
  // Cumming is one-shot per session — no re-rolling the draw.
  const canEnd = live && connected && afterPlay === null;
  const canPlay = connected && afterPlayOptions.length > 0;
  const playTitle = !connected
    ? "Connect the device first"
    : afterPlayOptions.length === 0
      ? "Tick at least one after-play outcome first"
      : undefined;

  const rawPositionMs = isCurrent ? player.positionMs : 0;
  const timeScale = isCurrent ? player.timeScale : 1;
  // ±1 min steps a *displayed* minute. The display is program-time ÷ rate, so the
  // program-time jump scales with the rate (at 4× a "1 min" step covers 4 min of
  // program-time). The timeline caps at the session length: forward never runs
  // past it (the clock may still drift past the end as Goon holds at top, but
  // scrubbing and the display stop at sessionMs).
  const jumpMs = JUMP_MS * timeScale;
  const canForward = isCurrent && rawPositionMs < sessionMs;
  const forward = () =>
    device.seekTo(Math.min(rawPositionMs + jumpMs, sessionMs));
  const back = () => device.seekTo(Math.max(0, rawPositionMs - jumpMs));

  // Two grammars that never overlap: the setup words are live only on the setup
  // level, everything else only on the play level — so the recognizer is always
  // listening for exactly the visible view's controls.
  const commands: Command[] = [
    {
      word: "shorter",
      enabled: !inPlay,
      run: () => stepSessionMinutes(-SESSION_STEP_MINUTES),
    },
    {
      word: "longer",
      enabled: !inPlay,
      run: () => stepSessionMinutes(SESSION_STEP_MINUTES),
    },
    // The after-play checkboxes: saying an outcome's word flips its tick, the
    // same handler as clicking it.
    ...AFTER_PLAY_OPTIONS.map((option) => ({
      word: AFTER_PLAY_WORDS[option],
      enabled: !inPlay,
      run: () => toggleAfterPlay(option, !afterPlayOptions.includes(option)),
    })),
    { word: "play", enabled: !inPlay && canPlay, run: enterPlay },
    ...stroke.keywords.map((k) => ({
      ...k,
      enabled: k.enabled && inPlay && !lockedOut,
    })),
    {
      word: "start",
      enabled: live && connected && state !== "playing",
      run: start,
    },
    {
      word: "stop",
      enabled: inPlay && state === "playing" && !unstoppable,
      run: stop,
    },
    { word: "reset", enabled: live && state !== "playing", run: reset },
    {
      word: "more",
      enabled: live && !lockedOut,
      run: () => stepIntensity(INTENSITY_STEP),
    },
    {
      word: "less",
      enabled: live && !lockedOut,
      run: () => stepIntensity(-INTENSITY_STEP),
    },
    {
      word: "forward",
      enabled: live && canForward && !unstoppable,
      run: forward,
    },
    { word: "back", enabled: live && !unstoppable, run: back },
    {
      word: "finish",
      enabled: canEnd,
      run: finish,
    },
    {
      word: "faster",
      enabled: live && !unstoppable,
      run: () => device.faster(),
    },
    {
      word: "slower",
      enabled: live && !unstoppable,
      run: () => device.slower(),
    },
    { word: "cumming", enabled: canEnd, run: cumming },
  ];
  useVoiceCommands(active, commands);

  const logError = useCallback(
    (message: string) => vacuglide.log(`error: ${message}`, "error"),
    [vacuglide],
  );

  if (!inPlay) {
    return (
      <section className="flex w-full flex-col gap-8">
        <SessionLengthCard
          minutes={sessionMinutes}
          onChange={setSessionMinutes}
        />

        <AfterPlayCard enabled={afterPlayOptions} onToggle={toggleAfterPlay} />

        <Card title="Safe word">
          <SafeWordField
            safeWord={safeWord}
            sanitize={sanitizeSafeWord}
            onSave={onSaveSafeWord}
          />
        </Card>

        <Button
          onClick={enterPlay}
          disabled={!canPlay}
          title={playTitle}
          className="w-full rounded-lg bg-blue-600 py-3.5 text-lg font-bold text-white disabled:opacity-50"
          badge="play"
        >
          Play
        </Button>

        <LogCard
          title="Command log"
          header={<RateLimitMeter {...vacuglide.rateLimit} />}
          entries={vacuglide.logEntries}
        />
      </section>
    );
  }

  const positionMs = Math.min(rawPositionMs, sessionMs);
  const pct = Math.round((positionMs / sessionMs) * 100);
  // Numbers scale with dilation: at 4× a 30-min build reads 7:30. The bar (a
  // fraction of the session) is rate-independent, so only the times shrink.
  const displayPositionMs = positionMs / timeScale;
  const displayTotalMs = sessionMs / timeScale;
  const jumpClass =
    "flex-1 rounded-lg bg-secondary py-3 text-sm font-medium disabled:opacity-50";

  return (
    <section className="flex w-full flex-col gap-8">
      <SessionControls
        state={state}
        connected={connected}
        onStart={start}
        onStop={stop}
        onReset={reset}
        stopDisabled={unstoppable}
        stopDisabledTitle="After-play has begun — only the safe word stops it now"
      />

      <Card>
        <Sparkline
          points={player.upcoming.speed}
          valves={player.upcoming.valves}
        />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>now</span>
          <span>+60s</span>
        </div>
      </Card>

      <div className="flex gap-3">
        <FinishButton onClick={finish} disabled={!canEnd} className="flex-1" />
        <CummingButton
          onClick={cumming}
          disabled={!canEnd}
          className="flex-1"
        />
      </div>

      <StrokeCard
        strokeDisabled={!stroke.canStroke || lockedOut}
        strokePulsing={stroke.strokePulsing}
        onValvePlus={vacuglide.valvePlus}
        onValveMinus={vacuglide.valveMinus}
        onError={logError}
      />

      <Card title="Intensity">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span>Ceiling</span>
          <span className="tabular-nums">{intensity}%</span>
        </div>
        <Slider
          value={intensity}
          min={0}
          max={100}
          step={5}
          onChange={changeIntensity}
          disabled={lockedOut}
        />
        <p className="text-muted-foreground mt-2 text-sm">
          Say <code>less</code> / <code>more</code> to step down or up.
        </p>
      </Card>

      <Card title="Timeline">
        <div className="text-muted-foreground flex justify-between text-sm">
          <span className="tabular-nums">{formatMs(displayPositionMs)}</span>
          <span className="tabular-nums">
            {formatMs(displayTotalMs)} · {pct}% · {timeScale.toFixed(2)}×
          </span>
        </div>
        <div className="bg-secondary mt-2 h-2 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-linear-to-r from-fuchsia-600 to-rose-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={back}
            disabled={!isCurrent || unstoppable}
            className={jumpClass}
            badge="back"
          >
            − 1 min
          </Button>
          <Button
            onClick={forward}
            disabled={!canForward || unstoppable}
            className={jumpClass}
            badge="forward"
          >
            + 1 min
          </Button>
        </div>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={() => device.slower()}
            disabled={!isCurrent || unstoppable}
            className={jumpClass}
            badge="slower"
          >
            Slower
          </Button>
          <Button
            onClick={() => device.faster()}
            disabled={!isCurrent || unstoppable}
            className={jumpClass}
            badge="faster"
          >
            Faster
          </Button>
        </div>
      </Card>

      <LogCard
        title="Command log"
        header={<RateLimitMeter {...vacuglide.rateLimit} />}
        entries={vacuglide.logEntries}
      />
    </section>
  );
}
