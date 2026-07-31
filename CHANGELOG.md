# Changelog

## 2026-07-31

- enhancement: **A failed reply says what went wrong** — When a companion
  can't reply, the error now carries what the provider actually said — out of
  credit, rate limited, no such model — instead of reading `LLM upstream error`
  whichever it was.

- enhancement: **A companion's card shows their own description** — A complete
  pack could leave `description` out of its companion section, and the card then
  showed the pack's `aboutThePack` blurb — what the pack adds — in place of a
  line about the companion. A complete pack must now carry one; `aboutThePack`
  stays on the Goonpacks screen, where it belongs.

- enhancement: **Building a pack no longer holds it in memory** —
  `npm run goonpack:build` read the whole pack in and built the whole zip before
  writing a byte, so a large pack took several gigabytes and one big enough
  could not be built at all. It now streams file by file, and peak memory no
  longer grows with the pack.

- bug: **The safe word can't be a word the app already uses** — Settings
  accepted `up`, `off`, `finish`, `torture` and most of the play modes' own
  spoken words as a safe word, so saying it halted the session and worked that
  control as well. Every word the app routes is now refused.

- bug: **Resetting mid-session stops the toy** — Resetting a Companions session
  while it was playing replaced the program but left the toy running, and
  neither Stop nor the safe word could reach it. Replacing a program now stops
  the toy first.

- bug: **Companions see the toy they just changed** — A companion who started
  the toy, or turned it up, was told for the rest of that turn that nothing had
  changed, so they could start it a second time or tell you it was off just
  after switching it on. They now read the toy again after each action they
  take.

- bug: **A stranded overlay now says why** — An overlay whose base pack was
  itself unusable — two installed versions of it disagreeing about being an
  overlay or a complete companion — listed as fine on the Goonpacks screen but
  appeared on no companion's card. It now lists as incompatible, with the
  reason.

- bug: **A pack's empty field is refused** — A manifest field left as `""` was
  read as a value rather than an omission, so it overrode the default it should
  have fallen back to. A pack with one now fails to import, saying which field
  is empty.

- bug: **Describing refuses a file a pack can't hold** — The
  `npm run goonpack:describe` command accepted a `.gif` or `.avif` and wrote the
  sidecar for it, which the build then rejected because the pack format carries
  neither. It now refuses the file instead.

- internal: **Extraction walks only the entries still being written** — The zip
  extractor kept every entry it had opened in one list and marked the finished
  ones, so each chunk of the stream rescanned the whole pack's worth of closed
  entries. Finished entries now leave the set, which also drops the nullable
  writer and the two null checks that went with it.

## 2026-07-30

- internal: **One sentence shape repeated is a style fault** — A claim, a gloss
  on a dash or colon, then a consequence on `so…`, used for every sentence down
  a page, reads as talk however well each sentence stands alone. Written into
  [CLAUDE.md](./CLAUDE.md), enforced by a `/style-check` pass that counts glosses
  and consequence tails across a whole document instead of reading sentence by
  sentence, and applied to the user-facing and developer docs, the roadmap
  threads and TODO.md.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

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

- internal: **The install marker moved out of the pack** — The file marking an
  extracted tree complete was written inside the pack's own directory, so
  validation had to be told to ignore it and extraction had to refuse a zip
  entry that would forge it. It is now a sibling of the directory, which drops
  both special cases and makes the tree an import validates the same set of
  names the zip carried. A re-import clears the previous marker before it starts
  writing, since removing the tree no longer takes it.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

- internal: **One writer for the sidecar format** — The describing scripts wrote
  a sidecar's frontmatter themselves, since a `.mjs` can't import the app's
  format module, leaving a second implementation nothing tested. They are
  TypeScript run through `tsx` now, like the build and summarise scripts, and
  call the same `renderSidecar` the round-trip test covers — so the writer and
  the validator can't drift, and both scripts are typechecked and linted with
  everything else. ([#25](https://github.com/autogoon/autogoon/pull/25))

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

- internal: **One pack format, and one tree** — `goonpack:build` hand-picked the
  files it fed the validator, so the validator judged a different tree from the
  one that shipped; it now walks the source, validates that, and zips what it
  validated, with `parsePack` refusing any path that isn't the manifest, the
  prompt or something under `media/`. The two accepted pack-format versions
  become one, numbered `1`: the compatibility path for the older layout is gone
  along with the bespoke check that stood in for the validator not seeing it.
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

- internal: **Settle how a companion will find a picture** — The replacement for
  picking media by number from the tool schema:
  two texts per item in a `.md` sidecar, a summary of the set in the manifest,
  and two tools in place of one — `search_media` returning a bounded set of refs
  and captions, `send_media` sending one by ref. The questions it deliberately
  leaves open — what a description should contain, which model writes it, how
  the search ranks, what the summary says — move into
  [roadmap/INFERENCE-LIBRARY.md](./roadmap/INFERENCE-LIBRARY.md), since none of
  them can be measured until the plumbing exists.
  ([#25](https://github.com/autogoon/autogoon/pull/25))

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

- internal: **Goonpack storage is OPFS trees** — Each installed pack is one OPFS
  directory tree keyed `id@version`, extracted in a worker from a streamed zip,
  validated over names alone, and made real by a marker file written last. A
  markerless tree is an interrupted import or removal, and one clean pass at
  load deletes it — unless the Web Lock an import holds for that key is still
  taken, which is what stops one tab's load sweeping away another's import.
  Nothing derived is persisted anywhere: the library index is rebuilt from the
  trees at every load, so "installed" is one live verdict against the current
  rules.
  ([#24](https://github.com/autogoon/autogoon/pull/24))

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

- internal: **The request is shaped so it can be cached** — The clock and the
  toy's status now ride their own system message at the end of each LLM
  request, instead of sitting at the foot of the persona prompt. Prompt caching
  matches a run of tokens from the start of a request, so two values changing
  every turn a few hundred tokens in meant nothing behind them could be reused —
  including the entire conversation, which is the part that grows all session.
  Everything a companion is sent up to those last two lines is now identical
  from one turn to the next. A registry test pins it, since re-introducing a
  per-turn value into the prompt would cost the whole prefix silently.

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

- internal: **The STT socket says why it died** — Server error messages and any
  websocket close we didn't initiate now reach the event log with their close
  code, instead of being dropped by the message switch's `default`. That's how
  ElevenLabs' undocumented idle rule was found: a clean 1000 about fourteen
  seconds after the last audio. Our own idle-close machinery is gone with it —
  timeout, poll interval, `noteVoice`, `maybeClose` and `shouldCloseSocket` —
  since there's no point racing a server that already does the job. The
  invariant this all rests on is written up in
  [ARCHITECTURE.md](./ARCHITECTURE.md).
  ([#22](https://github.com/autogoon/autogoon/pull/22))

- internal: **Comments describe the present too** — The current-state rule that
  keeps future work out of docs now covers code comments, in both directions: a
  comment says what the code does now, not what it replaced or used to be. The
  past is what `CHANGELOG.md` and git history are for. Written into
  [CLAUDE.md](./CLAUDE.md), enforced by `/doc-check` (which now treats every
  comment a branch touched as in scope), and applied to the three comments that
  had drifted.
  ([#22](https://github.com/autogoon/autogoon/pull/22))

## 2026-07-24

- feature: **Goonpacks** — Import a companion as a portable zip: a complete new
  companion, or an overlay that adds pictures or changes the voice, persona or
  colour of one you have. A Goonpacks tab (say `packs`) manages the library —
  import with a confirm step, see what every pack brings, remove per version —
  and versions of a pack install side by side. Companion cards gain pack
  pickers: their version and an overlay, newest first and remembered per
  companion. Every load re-checks stored packs against the current rules; one
  that fails lists as incompatible with plain-English reasons instead of
  half-working. Packs cache in browser storage with your zip as the source of
  truth. Assembly guide in [GOONPACKS.md](./GOONPACKS.md).
  ([#18](https://github.com/autogoon/autogoon/pull/18))

- enhancement: **Better picture captions** — The captioning scripts now have the
  vision model observe a picture out loud — where the weight is, where the knees
  and heels are, how each garment sits — before condensing that into the
  one-line caption, with explicit tests for the poses models confuse (sitting
  versus kneeling versus squatting), and a check that stops a close-fitting
  opaque garment being read as see-through. Both `npm run goonpack:describe` and
  `goonpack:describe-missing` now narrate each step, print those observations,
  and (in iTerm2) show the picture itself under its caption at the size the
  model saw it — so you can watch a run go past and judge each caption against
  what it describes. The caption itself now has to carry the setting, the
  garments, the hair and what's actually on show — down to what's only faintly
  visible, stated as precisely as the model saw it — and leaves mood out. The
  `DESCRIBE_MODEL` environment variable is now just `MODEL`.
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

- internal: **One Card component** — The home play-mode entries, the
  Companions chooser cards, the Goonpacks rows and the import confirm sheet
  all render a single `Card` (accent/dashed/button/voiceCommand/action/icon
  variants); `Button` gains a default control style with `tailwind-merge`
  override semantics, `badge` is renamed `voiceCommand` app-wide, and the
  voice chip and underline tabs are components of their own.
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

- internal: **Doc audit against the code** — A four-agent sweep verified ~280
  doc claims; fixed the drift it found (ARCHITECTURE.md predated Companions, the
  safe word and the tab strip; stale wind-down/finish figures in the mode docs;
  a few wrong code comments) and replaced doc passages that duplicated code with
  pointers, per the new documentation philosophy in CLAUDE.md.
  ([#14](https://github.com/autogoon/autogoon/pull/14))

- internal: **Rename algorithm → play mode across the codebase** —
  `src/lib/play-modes`, `src/components/play-modes`, the `PLAY_MODES` registry,
  `PlayModeEngine`, `setPlayModeKeywords`; the per-mode docs move to
  `modes/*.md` with `MODES.md` as the index.
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
