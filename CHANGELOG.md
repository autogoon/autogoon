# Changelog

## 2026-08-04

- enhancement: **Companions answer on a new model** — Companions now run on
  Nex-N2-Mini, which answers faster than the model it replaces, and fixes the
  MiniMax models sometimes leaking thinking into the conversation.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- enhancement: **A request for a picture stops returning the same ones** —
  Asking a companion for something they have a lot of came back with the same
  handful every time. Asking again now reaches the rest of the set.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- internal: **Companion prompts say each thing once** — The persona prompts
  carried trailing clauses that restated the instruction above them, or gave a
  reason the model can't act on; those are cut. Each prompt is now structured as
  markdown, so reflowing one can't merge a heading into the text below it.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

## 2026-08-03

- enhancement: **Synonyms in media search** — Asking a companion for a picture
  only turned up ones whose description happened to use the same word you did,
  so anything written up in other words was missed. The everyday words for the
  same thing now count as one.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- enhancement: **The app no longer takes the microphone by itself** — Opening
  Autogoon used to start listening for spoken commands straight away, so a tab
  left open held the mic all day. It now waits until you press Listen, and a new
  Microphone setting turns the old behaviour back on.
  ([#29](https://github.com/autogoon/autogoon/pull/29))

- enhancement: **Segmented controls show a hover** — The Intensity and
  variability options gave no feedback under the pointer. An unselected segment
  now takes its control's colour at half strength; the selected one lightens.
  ([#29](https://github.com/autogoon/autogoon/pull/29))

- enhancement: **`goonpack:build` zips only what a pack needs** — It no longer
  zips the whole directory, and includes only media with a valid sidecar.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- bug: **A companion fills a silence with the microphone off** — Filling a
  silence only ever worked while the mic was on, so a conversation held by
  typing sat quiet, and turning the mic off stopped a companion picking one up.
  It now follows the conversation, and ends when you leave Companions.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- internal: **`npm run llm:benchmark` times a model against a real conversation**
  — A conversation copied out of the Debug tab's request viewer, which now has a
  Copy button, is timed against a list of candidates, and what it measured is
  kept and reused. `scripts/llm-benchmark.ts` says how it runs.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- internal: **Goonpacks can be played off disk** — On a dev server, every
  directory under `goonpacks/` is offered on the Companions screen as it sits,
  so editing a persona prompt and reloading is the whole loop — no zip, no
  import. Each card picks which descriptions to play the pack with.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- internal: **The pack index is built on first sight, not at startup** — Reading
  every installed pack's sidecars happened at app load, whether or not anything
  went near a companion. It now happens the first time Companions or Goonpacks
  is opened. ([#30](https://github.com/autogoon/autogoon/pull/30))

## 2026-08-02

- feature: **Conversations have intros** — An intro introduces you to the
  companion and sets the scene, so you know how to play it from your first
  message. A goonpack sets its own in the manifest.
  ([#28](https://github.com/autogoon/autogoon/pull/28))

- internal: **Initial infrastructure for running inference experiments** — How a
  picture gets described decides what a companion can find, and changing it was
  guesswork. An experiment is a directory of code that describes a pack's media;
  its answers are recorded against ground truth entered by hand on a dev-only
  screen, so a prompt change can be measured rather than judged by eye. Early
  days — one experiment so far, and the workflow it should support is still
  being worked out. [INFERENCE.md](./INFERENCE.md) describes the harness.
  ([#30](https://github.com/autogoon/autogoon/pull/30))

- internal: **A pack's model settings move out of `companion`** — `model`,
  `contextWindow` and `passesReasoning` sit at the manifest's top level: which
  model to run is a decision about the pack, not about the companion. A pack
  setting them under `companion` is refused, naming the field.
  ([#28](https://github.com/autogoon/autogoon/pull/28))

- internal: **The redundant `'use client'` directives are gone**
  ([#28](https://github.com/autogoon/autogoon/pull/28))

## 2026-08-01

- feature: **A companion knows what time it is where you are** — Their pack says
  where they are, so they get the real time in both places. No "good morning" at
  your midnight, and a companion five hours behind you can say so.
  ([#27](https://github.com/autogoon/autogoon/pull/27))

- enhancement: **A companion offers the toy unasked** — Once a call turns
  sexual, driving the toy is part of what a companion is there for rather than
  something they wait to be asked for. Starting it still needs your say-so.
  ([#27](https://github.com/autogoon/autogoon/pull/27))

- internal: **Move device-specific instructions out of the persona** — What the
  device is and how it's driven sits in the shared control section. A companion
  also goes along with no toy: tell them
  you're using your hand today and they take it and carry on.
  ([#27](https://github.com/autogoon/autogoon/pull/27))

## 2026-07-31

- enhancement: **The browser tab says Autogoon** — The tab title and share card
  still named an early version of the app rather than the play modes and
  companions it has now.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- enhancement: **A failed reply says what went wrong** — When a companion
  can't reply, the error now carries what the provider actually said — out of
  credit, rate limited, no such model — instead of reading `LLM upstream error`
  whichever it was.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- enhancement: **A companion's card shows their own description** — A complete
  pack could leave `description` out of its companion section, and the card then
  showed the pack's `aboutThePack` blurb — what the pack adds — in place of a
  line about the companion. A complete pack must now carry one; `aboutThePack`
  stays on the Goonpacks screen, where it belongs.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- enhancement: **Building a pack no longer holds it in memory** —
  `npm run goonpack:build` read the whole pack in and built the whole zip before
  writing a byte, so a large pack took several gigabytes and one big enough
  could not be built at all. It now streams file by file, and peak memory no
  longer grows with the pack.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **A control you can't use no longer offers a word** — A greyed button
  kept its voice chip, so Goon's Stop during an unstoppable after-play showed
  `stop` next to a note saying only the safe word would work. Segmented controls
  had the opposite half: their words could be withdrawn while the segments
  stayed pressable.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **Summarising checks the manifest before it pays** — The
  `npm run goonpack:summarise` command generated a pack's summary and only then
  read its `manifest.json`, so a manifest that didn't parse cost a request and
  lost the summary it had bought.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **The changelog's tags are readable in light mode** — The `feature`,
  `enhancement`, `bug` and `internal` tags took their lettering from the theme
  while their fills stayed dark, so in the light theme each one was near-black
  on a dark pill.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **An overlay is coloured like the companion it plays as** — With more
  than one version of a base pack installed, an overlay's row on the Goonpacks
  screen took its colour from the oldest of them while the companion you played
  wore the newest, so the two disagreed.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **Send and Say it lock while you speak** — Both are disabled from the
  moment you start speaking until your transcript lands, so neither can send the
  typed text the live transcript has replaced on screen.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **Clearing the conversation stays cleared** — A companion with a pause
  already timed would break it seconds after you cleared the conversation,
  putting a line back into the thread you had just emptied. Clearing now takes
  the pending one with it; they wait until you speak.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **The Stroke controls come back after a jump** — Skipping forward, or
  turning a knob, while the program was holding a stroke valve open left the
  valve open and the Stroke buttons and their words dead for the rest of the
  session. The hold now ends when the part of the program it belonged to is
  discarded.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **A failed connection no longer costs the rest of the session** — If the
  speech connection didn't come up — a blip on the network, or the service
  refusing once — the companion stopped hearing anything until you stopped and
  started again, and nothing said why. It now tries again on the next thing you
  say, and the failure shows in the event log.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **The safe word can't be a word the app already uses** — Settings
  accepted `up`, `off`, `finish`, `torture` and most of the play modes' own
  spoken words as a safe word, so saying it halted the session and worked that
  control as well. Every word the app routes is now refused.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **Resetting mid-session stops the toy** — Resetting a Companions session
  while it was playing replaced the program but left the toy running, and
  neither Stop nor the safe word could reach it. Replacing a program now stops
  the toy first.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **Companions see the toy they just changed** — A companion who started
  the toy, or turned it up, was told for the rest of that turn that nothing had
  changed, so they could start it a second time or tell you it was off just
  after switching it on. They now read the toy again after each action they
  take.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **An overlay with an unusable base pack lists as incompatible** — It
  listed as fine on the Goonpacks screen but appeared on no companion's card.
  The reason is now given with it.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **A pack's empty field is refused** — A manifest field left as `""` was
  read as a value rather than an omission, so it overrode the default it should
  have fallen back to. A pack with one now fails to import, saying which field
  is empty.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- bug: **Describing refuses a file a pack can't hold** — The
  `npm run goonpack:describe` command accepted a `.gif` or `.avif` and wrote the
  sidecar for it, which the build then rejected because the pack format carries
  neither. It now refuses the file instead.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- internal: **Unused exports and arguments removed**
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- internal: **A TTS failure reaches the event log** — A non-OK `/api/tts`
  response resolved `play()` exactly as the end of playback does, so a failure
  was indistinguishable from a companion that didn't speak. `createTtsPlayer`
  now takes an error sink; a barge-in, which is how a reply normally ends early,
  stays silent.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

- internal: **A big pack imports at a steady pace** — Unpacking slowed with
  every file it had already written, so the largest packs crawled by the end.
  ([#26](https://github.com/autogoon/autogoon/pull/26))

## 2026-07-29

- enhancement: **Describe a pack's pictures in random order** —
  `npm run goonpack:describe-missing` took pictures in filename order, which is
  shoot order, so a run stopped part-way through had described one shoot and
  left the rest untouched. It now shuffles, so a part-described pack is a spread
  of the whole set. ([#25](https://github.com/autogoon/autogoon/pull/25))

- bug: **Finish leaves your Autopilot settings alone** — Pressing Finish used to
  snap Intensity to High, Edge Control to Moderate and Vacuum Maintenance to
  Off. It now pushes to full speed and closes the valves without touching what
  you had set. ([#25](https://github.com/autogoon/autogoon/pull/25))

## 2026-07-28

- feature: **Companions find a picture instead of picking one** — A companion
  used to pick from a numbered list of everything they had, which stops working
  past a few dozen. They now describe what they want in their own words and send
  one of the matches, never the same picture twice in a conversation. Each
  picture carries a caption and a fuller description in a `.md` sidecar beside
  it, and a pack carries a summary of the whole set.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- enhancement: **A companion can do two things in one turn** — A tool call used
  to be the only one a companion got per turn: whatever they did next had to
  wait for the turn after it. They can now carry on — find a picture and send it
  in the same breath, or move the intensity and the variety together — and the
  turn ends when they have something to say about what they did.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- enhancement: **Work on one pack instead of all of them** —
  `npm run goonpack:describe-missing`, `npm run goonpack:summarise` and
  `npm run goonpack:build` all take a pack directory now, so a change to one
  pack doesn't mean waiting for every other — and the three run in that order
  to take a new pack from pictures to a built zip.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- enhancement: **A built pack is the directory you built it from** —
  `npm run goonpack:build` now zips every file in the pack source, compressed
  the way a zip tool would compress it, so building a pack and zipping the
  folder yourself produce the same archive. It also says which media files still
  have no sidecar instead of building silently over them, naming the first few
  and counting the rest. ([#25](https://github.com/autogoon/autogoon/pull/25))

- bug: **Stroke is only offered when it can do something** — The Stroke buttons
  and the "up"/"down" words were live whenever a device was connected, but the
  stroke valves only move the device while it is running, so using them with
  nothing playing did nothing at all. They now stay out until a session is
  playing. ([#25](https://github.com/autogoon/autogoon/pull/25))

- bug: **A session runs to the length it says** — Program time ran slow by
  however long the device took to answer each command, so a 30-minute Goon build
  took nearer 36 minutes and the preview labelled "+60s" covered longer than a
  minute. A manual stroke pulse was short by the same margin.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- bug: **The microphone is handed back when listening fails to start** — If the
  app got the microphone but couldn't bring up the rest of the listening
  pipeline, it kept the microphone anyway: the browser's recording indicator
  stayed lit with nothing being heard, and every retry took another one. It now
  releases the microphone before reporting the failure.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **A thread that fails to save says so** — Writing a companion's
  conversation to browser storage can fail, most likely on a long thread passing
  the storage quota, and the error was discarded. Nothing went wrong until the
  next load found the conversation rewound to the last version that fit. The
  failure now appears in the Companions debug log as it happens.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **An unpacked pack holds only what the zip carried** — What marks an
  import finished used to live inside the pack itself, so every check of a pack
  had to make an exception for it, and a crafted zip could counterfeit it.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **One writer for the sidecar format** — The describing scripts wrote
  sidecars their own way rather than through the app's writer, so the two could
  drift and only one of them was tested. They now share it, and are typechecked
  and linted with everything else.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **Ending a voice session cancels a connect in flight** — Stopping a
  Companions session while its speech-to-text socket was still being opened
  could not stop it: the token request was already away, and the socket came up
  after teardown with nothing owning it. The connect is now abandoned when the
  token arrives. ([#25](https://github.com/autogoon/autogoon/pull/25))

## 2026-07-27

- enhancement: **See how much of the prompt was cached** — The debug tab now
  shows how many of a turn's prompt tokens the model recognised from the turn
  before, next to the existing timings. The whole conversation is re-sent every
  turn, so most of it should be cached and the share should climb as you talk;
  a low or zero share means something is being re-read from scratch each time,
  which until now was only visible on a bill. Shows "not reported" for a turn
  that came back with no token counts at all.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- enhancement: **Every companion knows the time** — The section explaining the
  clock used to sit inside the toy-control section, so a persona that left
  `{{CONTROL_SECTION}}` out was still told the real time and never told it was
  real. It's a section of its own now, added to every persona automatically with
  no token to place or forget — which also means it survives a companion that
  has no toy to control. Nothing changes for a persona that already pulls the
  control section in.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- enhancement: **A misspelled placeholder shows up instead of vanishing** —
  Writing `{{MEDIA_SECTON}}` in a persona used to leave nothing at all behind,
  so the section was simply missing with no sign why. An unrecognised
  placeholder now stays in the prompt exactly as typed.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- bug: **Building a pack could silently drop its media** — A folder inside
  `media/` stopped the build collecting files, and depending on its name that
  could mean losing every picture in the pack. The build reported success and
  wrote the pack anyway, so the first sign of it was a companion with nothing to
  send. Building now refuses a pack that holds anything a pack can't hold,
  naming the file. ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **A pack that builds is a pack that imports** — The build checked a
  different set of files from the one it shipped, so a zip could build cleanly
  and be refused on import. Both now read the same tree, and the two accepted
  pack-format versions become one, numbered `1`.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **Split the developer docs by task** — DEVELOPERS.md separates
  running the app from changing it, so someone who only wants to run Autogoon
  isn't handed the requirements for working on it.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- internal: **Play-mode guidance moves to ARCHITECTURE.md** — DEVELOPERS.md's
  two feature checklists are gone. Adding a play mode was a five-step procedure
  that turned out to be almost entirely architecture — the four-method contract,
  the registration paragraph and the knob-change table were already in
  ARCHITECTURE.md — so what remained joins the section describing the pair, now
  called Play modes. Adding a companion is a pointer to GOONPACKS.md instead of
  a checklist. DEVELOPERS.md's contribution list no longer branches on what you
  are building. ([#24](https://github.com/autogoon/autogoon/pull/24))

- internal: **GOONPACKS.md separates who leads from who drives the toy** —
  Persona guidance said to set "who leads during play" and that the app's
  sections are neutral on it, which reads as the toy, where they are not neutral
  at all. It now distinguishes the encounter, which is the persona's to set,
  from toy control, which every companion is given identically — writing against
  it doesn't override it, it hands the model two contradictory instructions. The
  `model` field gains a note that refusal behaviour and reliable tool-calling
  belong to the model, not the prompt.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

## 2026-07-26

- feature: **Companions can send you videos** — A goonpack can now carry video
  as well as stills: `.mp4` and `.webm` files sit alongside pictures with the
  same one-line captions, and a companion picks between them the same way — one
  numbered list, each entry marked picture or video. A video plays inline in the
  conversation and full-size when you open it. Authoring moved with it: media
  lives in a `media/` folder rather than `pictures/`, `noPictures` is now
  `noMedia`, the prompt token is `{{MEDIA_SECTION}}`, and the pack format is
  `2`. A pack still saying `1` that had neither a `pictures/` folder nor a
  `noPictures` field already is a format 2 pack and imports unchanged; one that
  had either is rejected, saying what to fix.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- enhancement: **Packs are unpacked, not stored whole** — Importing a pack now
  unzips it into your browser's storage once, showing its progress as it goes,
  instead of keeping the zip and re-reading it on every start. Packs of hundreds
  of megabytes — or gigabytes, with video — now list without the app reading a
  single picture: it reads the captions and nothing else, and only opens a file
  when it's about to show it. Packs installed before this change don't carry
  over, so re-import their zips; the storage the old copies held is reclaimed on
  the next start. Pictures sent in conversations before this change no longer
  show in the transcript — the conversations themselves are untouched.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- internal: **Hooks and components can be unit-tested** — Jest takes `.tsx`
  test files, and a test that renders a hook or a component asks for jsdom in a
  per-file docblock, so the engine and pack-parsing suites keep the node
  environment and the speed that comes with it. `useMediaUrl` and `MediaBubble`
  are the first two covered — between them they pin that a bubble whose pack was
  removed goes back to disk rather than holding a revoked URL, and that a file
  that has gone renders the placeholder and never a substitute.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- internal: **The send_media decision leaves the panel** — Which item a
  `send_media` call means, the numbered list the model chooses from, and the
  refusal when a stated kind disagrees with the number now live in
  `src/lib/companions/send-media.ts`; the panel keeps the tool's schema and
  opening the lightbox. The list and the pick are numbered in one place, so
  they can't drift, and all three decisions have tests.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- internal: **Tests that can actually fail** — Tests that passed with the
  behaviour they named broken are gone, replaced by real ones where the contract
  mattered, and contracts that had no test now have one.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

- internal: **An installed pack is a tree of files, not a stored zip** — An
  import that was interrupted leaves nothing half-installed to play, and a pack
  open in one tab can't be swept away by another. Whether a pack counts as
  installed is decided afresh at every load, so nothing stored can disagree with
  the current rules. ([#24](https://github.com/autogoon/autogoon/pull/24))

## 2026-07-25

- feature: **A companion keeps the conversation going** — Companions no longer
  wait silently for you to speak first. After each thing one says, they line up
  another turn, so a lull gets filled — picking the thread back up, teasing you
  about the quiet, or saying something about what the toy is doing to you. It's
  built for lying back mid-session and letting them drive. They decide when to
  stop rather than running down a clock: having said their piece, or having
  asked whether you're still there and would rather you answered, they go quiet
  until you speak. How readily a companion fills a silence is their own — two
  settings a goonpack can give them, one for while the toy is idle and one for
  while it's running, because someone of few words can still keep up a running
  commentary once things are underway.
  ([#23](https://github.com/autogoon/autogoon/pull/23))

- enhancement: **Companions know when the conversation has turned** — Every
  persona
  described the moment it stops being a chat and becomes something else in terms
  only they could judge — "once things heat up", "once there's a spark", "once
  he's got you going". Nothing said what that meant, so when a companion dropped
  the small talk and got explicit was a coin toss, and one could do it while you
  were still talking about your day. Each now names something that actually
  happens in the conversation instead: you say what you want, you flirt back, or
  they've started telling you what they're doing. The build-up lasts as long as
  it should. ([#23](https://github.com/autogoon/autogoon/pull/23))

- enhancement: **Companions know they're on a voice call** — A companion is
  heard, not seen, but Aimee's was written as a video call — she'd talk about
  watching you and offer to show you what she was doing, none of which is
  happening. Elise had them typing messages at each other rather than talking.
  Both now know the call is voice and pictures: anything they want you
  picturing, they have to say out loud, and they won't describe your end back at
  you as though it's on a screen. Aimee's accent is also Northern throughout —
  she's from outside Manchester, but half her persona had her Welsh.
  ([#23](https://github.com/autogoon/autogoon/pull/23))

- enhancement: **A companion knows what the toy does to you** — Companions were
  driving the device without ever being told what it is, so anything one said
  about how it felt was invented — the wrong shape, the wrong sensation,
  sometimes the wrong act entirely, in the middle of a scene where the words are
  the whole point. They're now told plainly what a Vacuglide is and what it does
  to whoever's wearing it — including what each variety level actually feels
  like, so a companion knows that turning it up high means leaving you stopped
  dead and waiting rather than just going faster. It applies to every companion,
  including imported ones: a goonpack author doesn't have to describe the
  hardware. ([#23](https://github.com/autogoon/autogoon/pull/23))

- enhancement: **See how talkative a companion is before you pick** — Each
  card on the picker now shows both silence-filling settings as a row of pips in
  that companion's own colour, so you can tell at a glance which will keep a
  conversation going and which will let it breathe.
  ([#23](https://github.com/autogoon/autogoon/pull/23))

- enhancement: **The message box shimmers while you speak** — The same shimmer
  that marks the message they're saying aloud now rings the message box while
  they're listening to you, so both halves of the conversation show whose turn
  is live in the same way. It appears the moment you start talking, not when the
  transcript catches up.
  ([#22](https://github.com/autogoon/autogoon/pull/22))

- enhancement: **Steadier message box while you talk** — The box no longer
  flickered between "Listening…" and its normal placeholder as you spoke,
  swapping what it showed with it. It now settles the moment you start talking
  and stays put through the gaps between words, until the transcript catches up
  or you've actually stopped.
  ([#22](https://github.com/autogoon/autogoon/pull/22))

- enhancement: **Quicker to interrupt a companion** — The app no longer drops
  the speech connection a few seconds after you stop talking, so interrupting
  them shortly after they start replying doesn't wait for a new connection to be
  set up first. Your microphone audio is only sent while you're actually saying
  something, so holding the line open costs nothing. The transcription service
  still closes an unused connection after a while of its own accord, so a very
  late interruption reconnects as before.
  ([#22](https://github.com/autogoon/autogoon/pull/22))

- enhancement: **The message being spoken shimmers** — Instead of a separate
  "Loading voice" and "Speaking" row in the conversation, the message itself now
  carries a slow shimmer around its edge: faint and unhurried while the voice
  loads, brighter and quicker once the words are being said. The message
  being spoken is the thing you're reading, so it's the thing that's marked.
  Listening, Thinking and Replying keep their own row — there's no message on
  screen yet for those. Over an open picture, the corner badge still names every
  stage.
  ([#22](https://github.com/autogoon/autogoon/pull/22))

- enhancement: **Companions reply faster** — Every companion's model now routes
  by throughput (OpenRouter's `:nitro`) instead of the default price-weighted
  load balancing, which had been spreading requests across providers regardless
  of speed. A companion's reply is spoken, so the wait before they start talking
  is what the conversation actually feels like.
  ([#21](https://github.com/autogoon/autogoon/pull/21))

- bug: **A companion won't start the toy on you** — Starting it now needs your
  say-so: you've asked for it, or agreed to it. A companion could previously
  decide to start it unprompted — one did, to get attention — which is no good
  when you might not be wearing it, ready, or alone. Your agreement carries
  across the conversation, and being made to wait for it doesn't count as it
  being withdrawn: teasing you and starting once they decide you've earned it is
  still theirs to do. Once it's running they have the same free rein over it as
  before, and they can always stop it.
  ([#23](https://github.com/autogoon/autogoon/pull/23))

- bug: **No more stray markup in the conversation** — Occasionally a companion's
  message would arrive as a block of code-like markup instead of them doing the
  thing they'd just described — and on a spoken turn it would be read aloud.
  That's the model writing an instruction out rather than performing it; the app
  now recognises those, carries out what was meant, and keeps the markup out of
  the conversation and out of their voice.
  ([#23](https://github.com/autogoon/autogoon/pull/23))

- bug: **Long messages aren't cut off** — The message box was a fixed height, so
  a long message — dictated or typed — ran on below the bottom of it out of
  sight. It now grows to fit what's in it, up to a limit past which it scrolls
  rather than crowding out the conversation above.
  ([#22](https://github.com/autogoon/autogoon/pull/22))

- bug: **Your words reach the message box** — What you were saying often failed
  to appear as you said it, especially when you spoke briefly or quietly: the
  app checked whether the microphone heard voice at the moment the transcript
  came back, by which point you had usually stopped. A transcript is now
  believed on the evidence of the speech that produced it — how long you were
  audible for, or simply carrying more than one word — so it shows up as you
  talk. Interrupting a companion works on short interjections too, which
  previously couldn't cut them off at all. ([#22](https://github.com/autogoon/autogoon/pull/22))

- internal: **A turn costs less as the conversation grows** — The clock and the
  toy's status sat inside the persona prompt, where changing every turn meant
  the whole conversation behind them was paid for again each time. They now go
  at the end of the request, and a test keeps them there.

- internal: **The voice session shows its working** — The event log gains the
  VAD's onset/offset edges with each run's measured length, and an unconfirmed
  partial now reports the evidence it was judged on rather than just the
  verdict. Kept in permanently: the edges are otherwise invisible, and they
  don't measure what they appear to — quiet speech dips under the offset
  threshold repeatedly, so "Thank you, honey." was credited 80ms of voicing.
  Without that number on screen the cause is indistinguishable from a wrong
  threshold. The line is also no longer called a phantom, which is a conclusion
  and frequently the wrong one.
  ([#22](https://github.com/autogoon/autogoon/pull/22))

- internal: **A dropped speech connection says why** — A server error, or the
  connection closing on us, went unrecorded, so a session that stopped hearing
  you gave no sign of what had happened. Both now reach the event log, and what
  they revealed — the service closes an idle connection itself — is written up
  in [ARCHITECTURE.md](./ARCHITECTURE.md).
  ([#22](https://github.com/autogoon/autogoon/pull/22))

## 2026-07-24

- feature: **Goonpacks: import a companion as a zip** — A pack is a complete new
  companion, or an overlay that adds pictures or changes the voice, persona or
  colour of one you have. The Goonpacks tab (say `packs`) manages the library,
  and [GOONPACKS.md](./GOONPACKS.md) says how to build one.
  ([#18](https://github.com/autogoon/autogoon/pull/18))

- enhancement: **A caption is written from an observation pass** — The vision
  model describes what it sees — the pose, how each garment sits — before
  condensing it into the one-line caption, so a caption carries the setting, the
  garments, the hair and what is on show rather than the mood.
  ([#20](https://github.com/autogoon/autogoon/pull/20))

- enhancement: **`goonpack:describe` shows the picture under its caption** —
  Both it and `goonpack:describe-missing` narrate each step and, in iTerm2,
  print the picture at the size the model saw it, so a run can be judged as it
  goes. ([#20](https://github.com/autogoon/autogoon/pull/20))

- enhancement: **`DESCRIBE_MODEL` is now `MODEL`** — The describe scripts read
  the model to use from `MODEL`.
  ([#20](https://github.com/autogoon/autogoon/pull/20))

- enhancement: **Elise moves out of the app** — The built-in companions are now
  Aimee and Miley. Elise's persona was extracted into a complete goonpack (kept
  outside the repo, like all packs), so she's imported and played like any other
  pack. Her pack carries a new id, so built-in Elise conversations don't carry
  over. ([#18](https://github.com/autogoon/autogoon/pull/18))

- enhancement: **A bolder, more consistent look** — Body text steps up from
  small to base size with one muted voice across every card, buttons wear a
  visible standard style that brightens on hover, voice-command chips become
  amber pills, and a card's controls (pack pickers, Remove) float in its top
  corner. ([#18](https://github.com/autogoon/autogoon/pull/18))

- enhancement: **Chat-first Companions play screen** — The play screen drops
  the app header, breadcrumb, tab strip and mic status card for one slim bar:
  a back button to the companion picker (locked while the program runs), the
  mic toggle with a small loudness sliver, and a hamburger menu that switches
  Session/Controls/Debug, toggles the program preview, and opens the LLM
  request viewer. The Listen and Connect chips don't appear on this screen —
  the chat gets the space, especially on mobile.
  ([#19](https://github.com/autogoon/autogoon/pull/19))

- enhancement: **Live voice-stage indicators** — The conversation now shows
  what's happening as it happens: you speaking, the companion thinking, the
  reply streaming in, their voice loading, and them speaking. In the chat it's a
  typing-indicator-style bubble on the talker's side; over an open picture it's
  a chunky badge in the lightbox's top corner. Icons pulse, the words shimmer,
  and both disappear when nothing is going on.
  ([#19](https://github.com/autogoon/autogoon/pull/19))

- bug: **Ignore phantom speech partials** — The speech recognizer can
  hallucinate a short token ("Yes.", "No.") from near-silence when its socket
  opens; that phantom used to appear in the composer and lock it as if you were
  dictating. Interim transcripts now only show once real speech is confirmed —
  a decoded word while the mic hears voice — and suppressed phantoms are noted
  in the event log. ([#19](https://github.com/autogoon/autogoon/pull/19))

- bug: **No empty bubble for a silent picture** — A companion sending a picture
  without saying anything no longer leaves an empty chat bubble next to it; the
  picture alone is the record.
  ([#19](https://github.com/autogoon/autogoon/pull/19))

- bug: **Work on older iPhones** — A regex feature unsupported by iOS Safari
  before 16.4 (a lookbehind, in the changelog parser) was a parse-time error
  that killed the whole app bundle: the page rendered but nothing was
  clickable. Rewritten without it.
  ([#18](https://github.com/autogoon/autogoon/pull/18))

- bug: **Changelog shows whole entries** — The in-app Changelog screen was
  dropping everything after the first line of a wrapped entry; entries now
  render in full, and the raw file can put blank lines between entries.
  ([#18](https://github.com/autogoon/autogoon/pull/18))

- internal: **Roadmap: a goonpack kit** — Written up the case for moving pack
  authoring — captioning, manifest, persona, build — out of the npm scripts and
  into a screen in the app, along with the constraint that shapes it: it would
  be the app's first filesystem route, so it can only exist in a dev build.
  [roadmap/GOONPACK-KIT.md](./roadmap/GOONPACK-KIT.md)
  ([#20](https://github.com/autogoon/autogoon/pull/20))

- internal: **Single quotes, and scripts get formatted** — Prettier now writes
  single quotes, and the `format` script covers `scripts/` as well, which had
  been the one source directory it never touched — so the two describe scripts
  no longer disagree about quoting. One repo-wide reformat, no behaviour change.
  ([#20](https://github.com/autogoon/autogoon/pull/20))

- internal: **Retire the build-time picture pipeline** — `gen:pictures`, the
  generated module and its pre-hooks are gone; pictures reach companions via
  goonpacks, and the describe scripts moved to `goonpack:*` scanning
  `goonpacks/*/pictures/`. ([#18](https://github.com/autogoon/autogoon/pull/18))

- internal: **Use the dev server from your phone** — Next blocks cross-origin
  dev asset requests (page visible, nothing clickable); the dev machine's LAN
  origin now comes from `DEV_ALLOWED_ORIGINS` in `.env` (documented in
  `.env.example`) since Next's wildcards can't span an IP's trailing octets.
  ([#18](https://github.com/autogoon/autogoon/pull/18))

- internal: **One Card component** — The home play-mode entries, the Companions
  chooser, the Goonpacks rows and the import sheet were four near-identical
  cards keeping their own styling in step by hand. They are now one, as are the
  buttons, the voice chips and the tabs.
  ([#18](https://github.com/autogoon/autogoon/pull/18))

- internal: **goonpack:build validates like the importer** — Building runs the
  app's own pack validation over every zip (the script is TypeScript now, run
  with `tsx`), reports every problem it finds in one pass, and writes
  `goonpacks/<dir>.zip` only when clean — a pack that builds is a pack that
  imports. ([#18](https://github.com/autogoon/autogoon/pull/18))

## 2026-07-23

- feature: **Companions notice time passing** — A companion now knows the real
  date and time on every turn, and when you step away — an hour, overnight —
  they come back aware of how long you were gone instead of resuming
  mid-sentence.
  The conversation shows each message's time and a date line where a new day
  starts. Conversations saved before this update have no times on their older
  messages. ([#17](https://github.com/autogoon/autogoon/pull/17))

- feature: **Add a third companion — Miley** — Companions now has three to pick
  from. Miley is an American sex-chat girl in Portland who's taken your call:
  dry, deadpan and funny, dressed up in tights and stockings, and up for pretty
  much anything you ask for. She has no illusions about what this is — she's
  working, there are no feelings involved, and she says so — but she's
  completely obliging with it, tells you out loud what she's doing to herself,
  and is generous rather than cruel with the toy. She has her own voice, sends
  pictures, and has three flat limits she won't move on.
  ([#16](https://github.com/autogoon/autogoon/pull/16))

- enhancement: **Companions needs no access key locally** — On the dev server
  (`npm run dev`) the access gate is open: put your API keys in `.env` and
  Companions just appears. Builds and deploys stay fail-closed behind
  `COMPANIONS_ACCESS_IDS` exactly as before, and the Settings access box still
  checks real IDs everywhere, so the gate stays testable in dev.
  ([#15](https://github.com/autogoon/autogoon/pull/15))

- enhancement: **Algorithms are now "play modes"** — The home screen and docs
  now call the ways a session can run play modes: Companions was never really an
  algorithm, and future modes (like a raw-controls Freestyle) won't be either.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- internal: **Debug viewer for the LLM request** — A Show request button on the
  Companions Debug tab pops up the exact request JSON the next turn would send
  (system prompt with live status/time filled in, gap markers, replayed tool
  calls), for verifying what the model actually sees.
  ([#17](https://github.com/autogoon/autogoon/pull/17))

- internal: **Caption images with their colours** — `npm run describe` now asks
  the vision model for the specific colours of the clothing in the picture, so a
  caption is precise enough to pick by when you ask for a particular outfit.
  ([#16](https://github.com/autogoon/autogoon/pull/16))

- internal: **Keep Claude session links out of commits** — Project settings now
  set `attribution.sessionUrl: false`, so commits and PR bodies made with Claude
  Code never carry a `Claude-Session` link (a privacy leak on a public repo, for
  any contributor). ([#14](https://github.com/autogoon/autogoon/pull/14))

- internal: **The docs match the code again** — ARCHITECTURE.md predated
  Companions, the safe word and the tab strip, the play-mode docs carried
  figures the engines no longer used, and several passages restated code instead
  of pointing at it. ([#14](https://github.com/autogoon/autogoon/pull/14))

- internal: **Rename algorithm → play mode across the codebase** — The code and
  the per-mode docs follow the name the app itself now uses.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- internal: **Restructure the roadmap into per-feature docs** — `ROADMAP.md` is
  now an index over `roadmap/*.md`, with the goonpack and inference discussion
  docs moved in (reframed generically), and `DEVELOPERS.md` gains a content
  policy: the project never distributes content or goonpacks, indexes packs, or
  recommends content sources, and contributions must keep it that way.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

## 2026-07-22

- feature: **Add a second companion — Aimee** — Companions now has two to pick
  from. Aimee is your sweet, eager-to-please Welsh girlfriend on a late-night
  video call: where Elise takes the lead, Aimee lets you drive — she follows
  your pace, likes it slow and soft with a gentle build, tells you out loud what
  she's doing to herself, and will match the toy to it if you like. She has her
  own voice, and remembers your conversation just like Elise.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- feature: **Companions can send you pictures** — During play, a companion with
  pictures can send you a photo of themselves, choosing one that fits the moment
  — ask for a particular pose and they'll pick accordingly. It opens filling
  the screen in a lightbox (tap the backdrop, ✕ or Escape to close), and stays
  in your conversation as a thumbnail you can tap to reopen; send another while
  the lightbox is open and it swaps to the newest.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- enhancement: **Companions run a Groove program** — The companion now drives a
  smooth Groove-style program (the same dip pattern the Groove and Goon
  algorithms use) instead of the old Autopilot-style one, and you steer it
  through two controls they can also turn themselves: Intensity (how hard and
  fast,
  0–100%) and Variety (how much it teases and mixes up the pace). The old edge
  and vacuum controls are gone.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- bug: **Fix a variability change before Start ramping from zero** — Changing
  Groove's dip or timing variability while the program was armed but not yet
  playing made the next cycle ramp up from a standstill instead of continuing
  from where the program sits; it now resumes from the program's current point
  (Companions' Variety knob shared the same fix).
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- bug: **Open a companion's chat at the newest message** — Opening a companion
  you've talked to before landed the conversation scrolled to the top; it now
  opens at the bottom, showing your most recent exchange.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- internal: **Add the describe scripts** — Caption a single
  companion image, or every image that's still missing a description, with a
  vision model (Qwen3-VL on OpenRouter by default, `DESCRIBE_MODEL` to
  override), writing the sidecar `.txt` the picture glob reads.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

## 2026-07-21

- feature: **Companions — talk to an AI companion** — A new hands-free
  algorithm: pick Elise and talk to her out loud. She transcribes what you say,
  replies in her own streamed voice, remembers the conversation across the
  session (and reloads), and can start and stop the toy herself as things unfold
  — speak over her and she stops mid-sentence to listen. For now Companions is
  unlocked with an access ID you enter under Settings.
  ([#13](https://github.com/autogoon/autogoon/pull/13))

- bug: **Fix voice input dropping the opening words** — The live transcriber
  discarded the audio recorded while its socket was still connecting (a 1–2
  second window), so the first second or two of speech went missing; that audio
  is now buffered and sent as soon as the socket is live.
  ([#13](https://github.com/autogoon/autogoon/pull/13))

## 2026-07-17

- feature: **Voice words for the after-play ticks** — Goon's four after-play
  outcomes now answer to voice in setup: say `gentle` (wind-down), `torture`,
  `stay` or `eject` to tick or untick one. Each row shows its word and flashes
  when heard, just like a button.
  ([#12](https://github.com/autogoon/autogoon/pull/12))

- enhancement: **Navigate the tabs by voice** — Say `home`, `changes` or
  `settings` from any top-level tab to switch to it. The Changelog tab is now
  called Changes — its old voice word wasn't in the recognizer's vocabulary, so
  it never answered. ([#12](https://github.com/autogoon/autogoon/pull/12))

- internal: **Fix the voice e2e test's locator** — The changelog's own "Vacuum
  Maintenance" mentions made the test's text locator ambiguous; it now asserts
  the visible heading by role.
  ([#12](https://github.com/autogoon/autogoon/pull/12))

## 2026-07-16

- feature: **Add a Changelog screen** — The app now shows this changelog: a
  Changelog tab sits just before Settings (say `changelog` on home), listing
  each day's changes with their tag pill and summary. It's baked in at build
  time, so what you read always matches the build you're running.
  ([#11](https://github.com/autogoon/autogoon/pull/11))

- feature: **Add after-play outcomes to Goon** — Goon now asks what `cumming`
  should bring. Tick any of four after-play outcomes in setup — wind-down (the
  classic glide, still the default), torture (straight to full speed and held),
  ruin: stay in (stops dead, seal held) and ruin: eject (pushes you out, then
  rests) — and one is drawn at random at the cumming point, so with several
  ticked you don't know what's coming. Torture and both ruins deliberately
  ignore your voice once started — Stop, and every other command with it; only
  the safe word halts them — and your ticks are remembered on this device. The
  Goon card on home shouts about it, and each algorithm now wears its own icon
  while we're at it. ([#11](https://github.com/autogoon/autogoon/pull/11))

- feature: **Add safe word** — Saying it while anything is playing always stops
  the device instantly, on every algorithm, exactly like Stop (nothing is
  reset). It defaults to `pineapple` and can be changed under Settings or on
  Goon's setup view, with a Test button that narrows the recogniser to just that
  word so you can check it's actually recognisable before relying on it. Unlike
  `stop`, which belongs to the algorithm, the safe word can never be disabled.
  ([#9](https://github.com/autogoon/autogoon/pull/9))

- feature: **Replace tabs with a home screen** — The app now opens on a home
  screen: device connection, the algorithm chooser (say one's name, or tap it,
  to enter) and getting-started steps, with Settings as a tab beside home
  (appearance, build info). Inside an algorithm, Exit (the breadcrumb, the
  spoken word, or the browser's back button) returns home; all of them are
  locked while a session runs, so you still can't switch algorithms mid-session.
  Reloading the page lands you back on the screen you were on.

- feature: **Give Goon a setup view** — Choose your session length (10–120
  minutes, default 30 — say `shorter` / `longer` to step it) and hit Play (or
  say it). The build scales to fit — a 15-minute session compresses the ramp, an
  hour-long one stretches it. Setup and play are separate levels (Home › Goon ›
  Play): setup choices lock once you're playing, Reset restarts the session from
  time 0, and Exit climbs back up to setup.

- enhancement: **Start the clock on Cumming and Finish** — Cumming and Finish
  now start the session clock themselves if it isn't running — on every
  algorithm — since the thing that prompts them can happen outside the app.
  ([#11](https://github.com/autogoon/autogoon/pull/11))

- enhancement: **Hide command logs on live** — The command logs are a
  development tool now — live builds hide them everywhere.
  ([#11](https://github.com/autogoon/autogoon/pull/11))

- enhancement: **Move voice words onto controls** — The "Listening for" bar is
  gone from every algorithm screen — the voice words are shown on the buttons
  and cards themselves, and the breadcrumb hints at `exit`.

- enhancement: **Simplify Goon's auto-tease** — Goon's automatic teasing is now
  just a single 10-second stroke− application at session start — the
  every-minute stroke− pulses and the five-minutely stroke+ pulses are gone.

- enhancement: **Flatten the UI** — The whole app now wears the home screen's
  flat look — the boxed cards are gone (headings and whitespace do the
  separating), Start and Play are one calm blue everywhere, the Stroke −/+
  buttons wear a cyan tint instead of black, and the algorithm chooser entries
  carry a big colour-coded icon on a soft diagonal tint of the same colour.
  Small controls — the token and safe word inputs, Test, Connect and the header
  chips — share a single lifted style so they stand out on the dark background.
  ([#9](https://github.com/autogoon/autogoon/pull/9))

- enhancement: **Give scheduled strokes precedence** — Manual strokes now yield
  to the program's own: while an algorithm holds a valve open (a suction pulse,
  a tease, an ending), the Stroke buttons and `up`/`down` words disable, and a
  scheduled stroke arriving mid-press releases your stroke first — the release
  always fires — then takes over. A ruin or torture ending can no longer be
  interfered with. ([#10](https://github.com/autogoon/autogoon/pull/10))

- bug: **Fix stroke pulses under dilation** — A manual stroke pulse
  (`up`/`down`) now rides the running program as real events instead of a
  wall-clock timer — its length stays true at any playback speed, and its
  release can no longer be lost to a knob change mid-pulse.
  ([#10](https://github.com/autogoon/autogoon/pull/10))

- bug: **Fix Autopilot's vacuum maintenance** — It now works like the original:
  a suction pulse fires only when the speed steps, with the Low/High interval as
  a minimum gap between pulses — not on a fixed 2–3 second repeat, which applied
  far more suction than the real autopilot.
  ([#10](https://github.com/autogoon/autogoon/pull/10))

- bug: **Fix coloured borders** — Coloured borders never actually rendered — a
  base stylesheet rule outranked every Tailwind border-colour utility, so the
  Connect button's connected green (and every other coloured border) showed as
  grey. ([#9](https://github.com/autogoon/autogoon/pull/9))

- internal: **Add the first test suites** — Jest unit tests for the device
  client's rate-limit accounting and the Goon engine's generation contract, and
  a Playwright end-to-end voice test that plays a synthesized "autopilot"
  through a stubbed microphone and asserts the tab switches — run against real
  Chromium, Firefox, and WebKit.
  ([#8](https://github.com/autogoon/autogoon/pull/8))

## 2026-07-14

- enhancement: **Keep dip timing uneven longer** — Goon's dips now keep some
  unevenness in their timing right to the end of the build, instead of settling
  into a metronome at 25 minutes. The pace slackens off gradually across the
  whole 30 minutes, so only the last few dips run at their full, unhurried
  length. ([#7](https://github.com/autogoon/autogoon/pull/7))

## 2026-07-09

- feature: **Add Groove dip variability** — Every dip now falls to a randomly
  drawn depth instead of the same one each time. Pick Off/Low/Medium/High, or
  say `flatter` / `hillier`. ([#6](https://github.com/autogoon/autogoon/pull/6))

- feature: **Show build info in Settings** — Settings now has an Info card
  showing what's live — the deployed commit (linked to its page on GitHub) and
  when the build was made, in the user's local time.
  ([#5](https://github.com/autogoon/autogoon/pull/5))

- enhancement: **Soften Groove's dip rhythm** — Groove's dips feel less
  mechanical: each rise and fall now takes a randomly drawn length of time
  rather than a fixed one, and the speed eases into the bottom of a dip instead
  of stepping evenly, so slow speeds change more gently.
  ([#6](https://github.com/autogoon/autogoon/pull/6))

- enhancement: **Scale Groove intensity evenly** — Groove's Intensity now scales
  the pattern evenly, so turning it down no longer flattens deep dips into
  shallow ones. ([#6](https://github.com/autogoon/autogoon/pull/6))

- enhancement: **Rename Groove's Speed to Intensity** — In Groove, the Speed
  card is now Intensity and steps with `more` / `less`, matching Goon and
  Autopilot — `faster` / `slower` now only ever means playback speed.
  ([#6](https://github.com/autogoon/autogoon/pull/6))

- enhancement: **Wind Goon's variability down over the build** — Goon's build
  now winds Groove's Dip and Timing variability down from high to off across its
  first 25 minutes, then flattens the dip away over the last 5. It opens with
  deep, ragged swings that can drop you to a standstill rather than dipping to
  the same depth every time, and eases into the hold at the top instead of
  arriving there abruptly. ([#6](https://github.com/autogoon/autogoon/pull/6))

- enhancement: **Scale Goon intensity evenly** — Goon's Intensity now scales the
  build evenly, so turning it down no longer squashes the dips into a narrow
  band near the top. ([#6](https://github.com/autogoon/autogoon/pull/6))

- enhancement: **Draw ramps as slopes** — The timeline preview draws a ramp as a
  smooth slope instead of a staircase, so a rise or fall reads as one movement
  rather than a run of tiny steps. Genuine holds are still drawn as steps.
  ([#6](https://github.com/autogoon/autogoon/pull/6))

- enhancement: **Move Goon's Intensity card up** — Goon's Intensity card now
  sits directly under the stroke controls rather than below the timeline,
  putting the control you reach for most within easier reach.
  ([#6](https://github.com/autogoon/autogoon/pull/6))

## 2026-07-08

- feature: **Show valve pulses in the preview** — The timeline preview now shows
  upcoming stroke and suction pulses, not just speed.
  ([#2](https://github.com/autogoon/autogoon/pull/2))

- feature: **Make Stop hold your place** — Stop now pauses and holds your place
  — Start picks up where you left off.
  ([#1](https://github.com/autogoon/autogoon/pull/1))

- feature: **Add Reset** — New Reset command (button or voice) to clear back to
  a fresh session. ([#1](https://github.com/autogoon/autogoon/pull/1))

- feature: **Preview the program before Start** — The program previews live
  before you press Start, so you can adjust it first.
  ([#1](https://github.com/autogoon/autogoon/pull/1))

- enhancement: **Scale previews with playback speed** — The sparkline preview
  and Goon's timeline now follow the playback speed — Goon's 30-minute build
  reads 7:30 at 4×, and the preview looks further ahead at higher speeds so it
  never runs out of curve. ([#2](https://github.com/autogoon/autogoon/pull/2))

- enhancement: **Flash buttons on voice and click** — On-screen buttons light up
  when you say their voice command, and now flash when you click them too.
  ([#2](https://github.com/autogoon/autogoon/pull/2))

- enhancement: **Voice-control everything on screen** — Voice now controls
  anything you can use on screen, not just while running.
  ([#1](https://github.com/autogoon/autogoon/pull/1))

- enhancement: **Colour Finish and Cumming apart** — Finish and Cumming are now
  visually distinct — Finish amber (the pre-ending), Cumming red (the send-off)
  — instead of two identical buttons.
  ([#4](https://github.com/autogoon/autogoon/pull/4))

- enhancement: **Allow stroke and endings while connected** — Manual stroke and
  the cumming/finish commands work any time a device is connected.
  ([#1](https://github.com/autogoon/autogoon/pull/1))

- bug: **Apply Vacuum Maintenance changes at once** — In Autopilot, changing
  Vacuum Maintenance had no effect on what you felt; it now reshapes the
  upcoming suction pulses straight away.
  ([#2](https://github.com/autogoon/autogoon/pull/2))

- bug: **Disable Finish until connected** — Goon's Finish button could be
  triggered with no device connected; it's now disabled until you connect.
  ([#2](https://github.com/autogoon/autogoon/pull/2))

- internal: **Reshuffle the control components** — Renamed the Start/Stop/Reset
  control `RunButton` → `SessionControls`, and moved Finish/Cumming out of the
  shared `StrokeCard` into dedicated `FinishButton`/`CummingButton` components
  each panel renders itself, leaving `StrokeCard` as just the shared stroke ±
  buttons. ([#4](https://github.com/autogoon/autogoon/pull/4))

- internal: **Document adding an algorithm** — Added an "Adding an algorithm"
  guide to DEVELOPERS.md (step-by-step checklist, the knob→device method table,
  and the `generateSpeed` pitfalls), pointed at Goon as the reference to copy,
  and made the algorithm tab list derive from a single `TABS` source in
  `page.tsx` so a new mode's voice switch word and tab lock can't be silently
  forgotten. ([#4](https://github.com/autogoon/autogoon/pull/4))

- internal: **Split speed and valve generation** — Engine generation is split
  into a speed backbone (`generateSpeed`) and a pure valve overlay
  (`generateValves`), so the Player can re-lay valves over an unchanged speed
  script via `invalidateValves()`.
  ([#2](https://github.com/autogoon/autogoon/pull/2))

- internal: **Restructure into engines and panels** — Each algorithm is now an
  engine plus a panel, dropping the per-algorithm hooks and the runner; mutual
  exclusion is a Player invariant.
  ([#2](https://github.com/autogoon/autogoon/pull/2))
