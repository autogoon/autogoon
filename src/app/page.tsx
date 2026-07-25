'use client';

// Wires the app together and lays out the header, navigation and screens. The
// heavy lifting lives elsewhere: each play mode is one self-contained module
// that owns its engine + panel + commands, the Player (in useVacuglideDevice)
// plays one engine at a time, and the KeywordSpotterProvider owns the single
// recognizer. This file only holds the navigation state and the two genuinely
// global concerns: which words are live and routing them.
//
// Navigation is a two-level hierarchy, not tabs: **home** (the play mode
// chooser, plus the device/appearance cards) and one screen per play mode.
// You never move sideways between play modes — home's words are the play mode
// names, a play mode screen's word is `exit` (back up), and exit is locked
// while a session runs, so the grammar always matches the visible screen and
// the illegal mid-session switch simply cannot be said or tapped. The
// exception is the top-level tab strip (Home / Goonpacks / Changes /
// Settings): those screens are siblings, so each other's tab words are live
// there — sideways moves between tabs are exactly what the visible tabs
// offer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioWaveform, Bot, MessagesSquare, TrendingUp } from 'lucide-react';
import { Button } from '@/components/button';
import { TabButton } from '@/components/tab-button';
import { AutopilotPanel } from '@/components/play-modes/autopilot-panel';
import { CompanionsPanel } from '@/components/play-modes/companions-panel';
import { GroovePanel } from '@/components/play-modes/groove-panel';
import { GoonPanel } from '@/components/play-modes/goon-panel';
import { HeaderBar } from '@/components/header-bar';
import { GoonpacksPanel } from '@/components/goonpacks-panel';
import { HomePanel } from '@/components/home-panel';
import { ChangelogPanel } from '@/components/changelog-panel';
import { SettingsPanel } from '@/components/settings-panel';
import {
  KeywordSpotterProvider,
  useKeywordSpotter,
} from '@/components/keyword-spotter';
import { useCompanionsAccess } from '@/hooks/use-companions-access';
import { usePlayer } from '@/hooks/use-player';
import { useVacuglideDevice } from '@/hooks/use-vacuglide-device';
import {
  DEFAULT_SAFE_WORD,
  SAFE_WORD_STORAGE_KEY,
  sanitizeSafeWord,
} from '@/lib/safe-word';

// The play mode registry: each entry is a home-page listing (label +
// description + icon), a screen, and a voice word (the id, live on home) all
// at once. Adding a mode is an entry here plus its panel rendered below — the
// switch word and screen follow automatically and the lists can never drift.
// Each entry wears its play mode's signature bright colour twice: the icon
// (iconClass) and the row's accent — the colour name Card turns into the
// tinted border/gradient shell.
// On the dev server Companions is always available (the paid routes are open —
// see access-check.ts); the access gate applies to builds/deploys.
const IS_DEV = process.env.NODE_ENV === 'development';

const PLAY_MODES = [
  {
    id: 'goon',
    label: 'Goon',
    description:
      'An automatic slow build over a session length you choose — deep, ragged dips that gradually settle into a steady hold at the top.',
    highlight:
      'New: choose what cumming brings — wind-down, torture or a ruin (stay in, or eject), drawn at random from the outcomes you tick.',
    icon: TrendingUp,
    iconClass: 'text-fuchsia-500',
    accent: 'fuchsia',
  },
  {
    id: 'groove',
    label: 'Groove',
    description:
      'A manual stroke pattern you shape live — intensity plus dip and timing variability.',
    icon: AudioWaveform,
    iconClass: 'text-cyan-500',
    accent: 'cyan',
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    description: "A faithful recreation of the Vacuglide's own autopilot.",
    icon: Bot,
    iconClass: 'text-orange-500',
    accent: 'orange',
  },
  {
    id: 'companions',
    label: 'Companions',
    description:
      'Pick a companion and talk — she listens, replies in her own voice, and you can cut in any time.',
    icon: MessagesSquare,
    iconClass: 'text-emerald-500',
    accent: 'emerald',
  },
] as const;

type PlayModeId = (typeof PLAY_MODES)[number]['id'];
// A play mode's setup is its own level (`#goon`), with the live session one
// below (`#goon/play`) — for play modes that have a setup view (only Goon so
// far; Groove and Autopilot never navigate to a `/play`).
type Screen =
  | 'home'
  | 'goonpacks'
  | 'settings'
  | 'changes'
  | PlayModeId
  | `${PlayModeId}/play`;

// The sibling tabs at the top level — see the tab strip below. Their ids
// double as their voice words, live on whichever tab you're on — except
// Goonpacks, whose spoken word is `packs` ("goonpacks" isn't in vosk's
// lexicon, so the compound would never be spotted).
type TabId = 'home' | 'goonpacks' | 'settings' | 'changes';
const isTabId = (id: string): id is TabId =>
  id === 'home' || id === 'goonpacks' || id === 'settings' || id === 'changes';

const isPlayModeId = (id: string): id is PlayModeId =>
  PLAY_MODES.some((a) => a.id === id);

// The screen the URL names: `#goon`, `#goon/play`, `#settings`…; no (known)
// hash = home.
const hashScreen = (): Screen => {
  const [base, sub] = window.location.hash.slice(1).split('/');
  if (base !== undefined && isPlayModeId(base)) {
    return sub === 'play' ? `${base}/play` : base;
  }
  return base === 'goonpacks' || base === 'settings' || base === 'changes'
    ? base
    : 'home';
};

// One level up: play -> its play mode's setup, everything else -> home.
const parentOf = (s: Screen): Screen =>
  s.includes('/') ? (s.split('/')[0] as Screen) : 'home';

// Words the safe word may not take: everything the grammar already routes
// elsewhere — the global words plus the shared transport words the panels
// declare. One utterance must never mean two things.
const SAFE_WORD_RESERVED = [
  'connect',
  'exit',
  'home',
  'settings',
  'start',
  'stop',
  'reset',
  'changes',
  'packs', // the Goonpacks tab's spoken word
  ...PLAY_MODES.map((a) => a.id),
];
// The validator the editing surfaces use, with the reserved list baked in.
const sanitizeCandidate = (input: string): string | null =>
  sanitizeSafeWord(input, SAFE_WORD_RESERVED);

export default function Home() {
  return (
    <KeywordSpotterProvider>
      <App />
    </KeywordSpotterProvider>
  );
}

function App() {
  const vacuglide = useVacuglideDevice();
  const player = usePlayer(vacuglide.player);
  const access = useCompanionsAccess();
  const spotter = useKeywordSpotter();
  // Only the spotter's stable functions may be used in effect deps — the context
  // object's identity churns with grammar/flash state (see useVoiceCommands).
  const { setGlobalWords, keywordListener } = spotter;
  const [screen, setScreen] = useState<Screen>('home');

  // Companions is hidden from the chooser, the home grammar and navigation until
  // its access ID unlocks it (see useCompanionsAccess). The gate is fail-closed
  // (see access-check.ts): with COMPANIONS_ACCESS_IDS unset nothing validates,
  // so Companions stays hidden and the other play modes show exactly as before.
  // The dev server is the exception: the paid routes are open there, so the
  // card always shows — while the Settings box still validates real IDs.
  const availablePlayModes = useMemo(
    () =>
      access.granted || IS_DEV
        ? PLAY_MODES
        : PLAY_MODES.filter((a) => a.id !== 'companions'),
    [access.granted],
  );
  // The Goonpacks tab manages companion packs, so it shows (and its word is
  // live) exactly when Companions itself is available.
  const goonpacksShown = access.granted || IS_DEV;

  // A session is in progress whenever the Player is not idle. You can only
  // start one from its play mode's screen and you can't leave while it runs
  // (exit is locked below), so the running play mode is always exactly the
  // screen you're on — no separate tracking needed.
  const running = player.state !== 'armed';

  // The safe word — the always-on hard stop (see src/lib/safe-word.ts). It
  // lives here, not in the panels, so no play mode can ever gate it: panels
  // own `stop` and may one day ignore it; the safe word bypasses them and
  // halts the Player directly. Persisted across sessions; the stored value is
  // re-validated on load in case a stale one clashes with words added since.
  const [safeWord, setSafeWordState] = useState(DEFAULT_SAFE_WORD);
  useEffect(() => {
    const stored = localStorage.getItem(SAFE_WORD_STORAGE_KEY);
    if (stored === null) return;
    const word = sanitizeCandidate(stored);
    if (word !== null) setSafeWordState(word);
  }, []);
  // Takes an already-sanitized word (the editing surfaces validate with
  // sanitizeCandidate before calling this).
  const saveSafeWord = useCallback((word: string) => {
    setSafeWordState(word);
    localStorage.setItem(SAFE_WORD_STORAGE_KEY, word);
  }, []);

  // The global grammar slot: connect (while disconnected) everywhere; the
  // play mode names on home; the other two tabs' words on any top-level tab;
  // exit anywhere below the top level while nothing runs; the safe word
  // whenever something is playing — exactly where `stop` is live.
  const connected = vacuglide.connected;
  const playing = player.state === 'playing';
  useEffect(() => {
    const words: string[] = [];
    if (!connected) words.push('connect');
    if (playing) words.push(safeWord);
    if (isTabId(screen)) {
      if (screen === 'home') words.push(...availablePlayModes.map((a) => a.id));
      // The visible tabs, minus the one you're on (a disabled control is out
      // of the grammar; so is the tab that would go nowhere). Goonpacks
      // speaks as `packs`, and only while its tab shows.
      words.push(
        ...(['home', 'changes', 'settings'] as const).filter(
          (t) => t !== screen,
        ),
      );
      if (goonpacksShown && screen !== 'goonpacks') words.push('packs');
    } else if (!running) {
      words.push('exit');
    }
    setGlobalWords(words);
  }, [
    connected,
    goonpacksShown,
    running,
    playing,
    safeWord,
    screen,
    availablePlayModes,
    setGlobalWords,
  ]);

  const runningRef = useRef(running);
  runningRef.current = running;
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // Screen ↔ URL: entering a screen pushes `#<id>`, so the browser back button,
  // reloads and deep-links all behave as expected. popstate syncs state from
  // the hash — unless a session runs, in which case the consumed entry is
  // pushed straight back: the browser's back button can't leave mid-session
  // any more than exit can.
  const navigate = useCallback((next: Screen) => {
    setScreen(next);
    window.history.pushState(
      null,
      '',
      next === 'home' ? window.location.pathname : `#${next}`,
    );
  }, []);
  useEffect(() => {
    // Land wherever the URL points (reload / deep-link); plain loads read home.
    // A `/play` deep-link is normalized to its setup level — the session it
    // named didn't survive the reload, so re-entering play means re-arming.
    const initial = hashScreen();
    const landing = parentOf(initial) === 'home' ? initial : parentOf(initial);
    if (landing !== initial) {
      window.history.replaceState(null, '', `#${landing}`);
    }
    setScreen(landing);
    const onPop = () => {
      if (runningRef.current) {
        window.history.pushState(null, '', `#${screenRef.current}`);
        return;
      }
      setScreen(hashScreen());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // A deep-link or reload onto Companions while it's locked (or never unlocked)
  // bounces home once the access check resolves. Waits for `checked` so a
  // genuine reload-with-stored-ID isn't kicked out before validation lands.
  // Never bounces on the dev server — Companions is always available there.
  useEffect(() => {
    if (
      access.checked &&
      !access.granted &&
      !IS_DEV &&
      (screen.split('/')[0] === 'companions' || screen === 'goonpacks')
    ) {
      navigate('home');
    }
  }, [access.checked, access.granted, screen, navigate]);

  // Route the global words. connect drives the device; a play mode name (on
  // home) enters that play mode; exit (while idle) goes back up. Everything
  // else is a play mode word, owned and handled by the active panel. State is
  // read through refs so this listener subscribes once, not on every render.
  const connectRef = useRef(vacuglide.connect);
  connectRef.current = vacuglide.connect;
  const logRef = useRef(vacuglide.log);
  logRef.current = vacuglide.log;
  const safeWordRef = useRef(safeWord);
  safeWordRef.current = safeWord;
  const playerRef = useRef(vacuglide.player);
  playerRef.current = vacuglide.player;
  useEffect(() => {
    return keywordListener((word) => {
      // Central log of every recognised command word, so every play mode's voice
      // hits show up. Fires alongside the active panel's own handler and the
      // "Listening for" flash — all three ride the same detection.
      logRef.current(`🎙 ${word}`, 'hit');
      if (word === safeWordRef.current) {
        // The safe word: halt exactly like Stop, no reset. Routed before (and
        // independently of) everything else; pause() no-ops unless playing, so
        // hearing it outside a session (the test modal) is harmless.
        void playerRef.current.pause();
        return;
      }
      if (word === 'connect') {
        void connectRef.current();
        return;
      }
      if (word === 'exit' && !runningRef.current) {
        navigate(parentOf(screenRef.current));
        return;
      }
      if (isPlayModeId(word) && screenRef.current === 'home') {
        navigate(word);
        return;
      }
      // A tab's word, heard on a sibling tab, is a sideways move. Goonpacks
      // answers to `packs` (see TabId's comment).
      if (word === 'packs' && isTabId(screenRef.current)) {
        navigate('goonpacks');
        return;
      }
      if (isTabId(word) && isTabId(screenRef.current)) {
        navigate(word);
      }
    });
  }, [keywordListener, navigate]);

  // Top level = home + its Changes/Settings siblings, shown as the tab strip;
  // play mode screens get the breadcrumb instead: Home › Goon (setup),
  // and Home › Goon › Play once a session's been generated.
  const topLevel = isTabId(screen);
  const screenBase = screen.split('/')[0]!;
  const currentPlayMode = PLAY_MODES.find((a) => a.id === screenBase) ?? null;
  const atPlayLevel = screen.endsWith('/play');
  // Companions' play screen strips the app chrome — header and breadcrumb —
  // down to the panel's own slim bar, so the chat gets the screen.
  const chromeless = screen === 'companions/play';
  const crumbLink =
    'rounded-none border-0 bg-transparent p-0 enabled:hover:bg-transparent text-muted-foreground hover:text-foreground font-medium underline-offset-4 hover:underline disabled:opacity-50';

  return (
    <>
      {!chromeless && <HeaderBar kws={spotter} vacuglide={vacuglide} />}
      <div className="mx-auto w-full max-w-2xl px-4">
        {topLevel && (
          <nav className="flex gap-6 border-b">
            {(
              [
                // `align: "right"` marks where the right-hand cluster starts
                // (ml-auto); the tabs after it just follow.
                { id: 'home', label: 'Home', align: 'left' },
                { id: 'goonpacks', label: 'Goonpacks', align: 'left' },
                { id: 'changes', label: 'Changes', align: 'right' },
                { id: 'settings', label: 'Settings', align: 'left' },
              ] as const
            )
              .filter((t) => t.id !== 'goonpacks' || goonpacksShown)
              .map((t) => (
                <TabButton
                  key={t.id}
                  active={screen === t.id}
                  onClick={() => navigate(t.id)}
                  className={t.align === 'right' ? 'ml-auto' : undefined}
                >
                  {t.label}
                </TabButton>
              ))}
          </nav>
        )}
        {currentPlayMode !== null && !chromeless && (
          // The breadcrumb: the way back up, locked while a session runs (the
          // old tab lock's rule — stop before you leave).
          <nav className="flex items-center gap-2 border-b py-3 text-sm">
            <Button
              onClick={() => navigate('home')}
              disabled={running}
              title={running ? 'Stop the session first' : undefined}
              className={crumbLink}
            >
              Home
            </Button>
            <span className="text-muted-foreground">›</span>
            {atPlayLevel ? (
              <>
                <Button
                  onClick={() => navigate(currentPlayMode.id)}
                  disabled={running}
                  title={running ? 'Stop the session first' : undefined}
                  className={crumbLink}
                >
                  {currentPlayMode.label}
                </Button>
                <span className="text-muted-foreground">›</span>
                <span className="font-medium">Play</span>
              </>
            ) : (
              <span className="font-medium">{currentPlayMode.label}</span>
            )}
            {!running && (
              <span className="text-muted-foreground ml-auto text-xs">
                Say <code>exit</code> to go back
              </span>
            )}
          </nav>
        )}
        <main className="py-6">
          <div className={screen === 'goonpacks' ? undefined : 'hidden'}>
            <GoonpacksPanel />
          </div>
          <div className={screen === 'home' ? undefined : 'hidden'}>
            <HomePanel
              vacuglide={vacuglide}
              playModes={availablePlayModes}
              onSelect={(id) => {
                if (isPlayModeId(id) || id === 'settings') navigate(id);
              }}
            />
          </div>
          <div className={screenBase === 'goon' ? undefined : 'hidden'}>
            <GoonPanel
              vacuglide={vacuglide}
              player={player}
              active={screenBase === 'goon'}
              view={atPlayLevel ? 'play' : 'setup'}
              onEnterPlay={() => navigate('goon/play')}
              safeWord={safeWord}
              sanitizeSafeWord={sanitizeCandidate}
              onSaveSafeWord={saveSafeWord}
            />
          </div>
          <div className={screen === 'groove' ? undefined : 'hidden'}>
            <GroovePanel
              vacuglide={vacuglide}
              player={player}
              active={screen === 'groove'}
            />
          </div>
          <div className={screen === 'autopilot' ? undefined : 'hidden'}>
            <AutopilotPanel
              vacuglide={vacuglide}
              player={player}
              active={screen === 'autopilot'}
            />
          </div>
          <div className={screenBase === 'companions' ? undefined : 'hidden'}>
            <CompanionsPanel
              vacuglide={vacuglide}
              player={player}
              active={screenBase === 'companions'}
              view={atPlayLevel ? 'play' : 'setup'}
              onEnterPlay={() => navigate('companions/play')}
              onExitPlay={() => navigate('companions')}
            />
          </div>
          <div className={screen === 'changes' ? undefined : 'hidden'}>
            <ChangelogPanel />
          </div>
          <div className={screen === 'settings' ? undefined : 'hidden'}>
            <SettingsPanel
              safeWord={safeWord}
              sanitizeSafeWord={sanitizeCandidate}
              onSaveSafeWord={saveSafeWord}
              access={access}
            />
          </div>
        </main>
      </div>
    </>
  );
}
