# Roadmap

Direction and design thinking — ideas that still need to be thought through and
specified more firmly before implementation.

Some ideas might need some prototyping and testing to work out how well they
work.

## Improve keyword detection

If watching videos, it's common for them to trigger keywords in the background,
which is a problem. Does Vosk support any options which can require a certain
volume, or clarity? Are there other KWS options which rely on voice training so
it can recognise the user's voice and ignore background noise?

## Algorithm options

Options which seem like they should belong to all algorithms, grouped by when
they happen:

- **mid-play**: During the ride.
- **end-play**: The point you decide you want to cum — it drops into a finish
  mode and drives you toward climax.
- **after-play**: From the moment you start to cum.

Autopilot is a faithful implementation of the Vacuglide algorithm, but these
options are really additive, users can keep that faithful implementation by not
enabling any of the options.

### Mid-play — during the ride

- **Edge** — say **"edge"** → short cool-down → wait → build back up.
  - **Edge length** — how long the pause lasts before it ramps back: short
    teases vs. long denials.
    - User adjustable, with some randomisation? Danger of restarting too soon
      and causing an orgasm.
    - Maybe a voice command to resume, but then it's the same as Stop/Start.
    - There is this : https://github.com/nogasm/nogasm
  - A % chance it **ignores your "edge"**
    - **Does the chance grow?** Maybe it climbs the longer the session runs, it
      climbs with each "edge" you survive, or it's just a flat chance every
      time.
  - **How to best expose the options?** Could end up being a checkbox/slider
    nightmare!

### End-play — the run to finish

You signal you're ready to finish (a **"finish"** command) and the device goes
into a **finish mode** that drives you toward climax rather than riding on

Autopilot goes to full speed until you say stop, Goon goes to the end of its
ramp (so to the intensity percentage set.)

### After-play — from the moment you cum

Saying **"cumming"** splices in an after-play behaviour.

- **Wind-down** — Simulate a penetrative orgasm, a slow, comfortable decrease
  (like Goon and Groove implement in `beginCumming()`).
- **Torture** — Speed goes straight to 100%, and ignore the Stop command.
- **Ruin** — There are two possible options here :
  - **Stay-in** — stop the device, leaving you still seated in the toy. The
    vacuum seal stays, so there's still passive sensation — a softer, less
    complete ruin.
  - **Eject** — drive the toy to physically push you out, removing all contact
    — a more complete ruin
    - However, generating that ejecting force takes a second or two of movement,
      which is stimulation at exactly the wrong moment; with voice-recognition
      lag on top (~1s between saying "cumming" and the device reacting), it may
      fail to cut stimulation in time and tip into a finish instead of a ruin.
    - Worth noting a ruin is timing-dependent anyway — even by hand it doesn't
      always land — so some unreliability here may be acceptable rather than a
      flaw to design out.

It might be an option to combine these into a single after-play, like ruin but
then torture.

How to best expose the options? Could end up being a checkbox/slider nightmare!

Any outcome that ignores **Stop** is backstopped by the always-on safe word
(a concrete task in [TODO.md](./TODO.md)).

## New algorithm candidates

### Lasting-longer training (stop-start/Semans)

Stop-start (the Semans technique) is a recognised behavioural treatment for
premature ejaculation: build up to just before the point of no return, stop
dead until the urge fades, then start again, repeating several times before
finishing (one trial ran five stops, then finished on the sixth [2])

Groove with variability off, plus the Stop/Start voice commands, already does
the mechanical part. The open question is whether we can add anything that
materially helps.

What the research says:

- It works, and the active ingredient is **awareness** — learning to recognise
  the run-up to the point of no return and back off. Trials frame the mechanism
  as "increased awareness of the ejaculation reflex", and show men going from
  ~35 seconds to ~3–4 minutes after a few weeks of daily practice [2].
- Adding **pelvic-floor control** (Kegels, plus slow breathing and staying
  relaxed during stimulation) roughly doubled that, to ~9 minutes in the same
  trial [2]. Worth teaching alongside.
- A common way to teach the awareness is a **0–10 arousal scale**: learn to
  read where you are, spend the session in a middle band (often taught as
  roughly 4–7), and treat the top end (~8–9) as the signal to stop before the
  point of no return at 10 [4]. The exact numbers are a teaching heuristic, not
  a hard clinical threshold — the point is building the self-reading, which is
  the same skill the stop itself trains.
- Evidence overall is limited and low quality (small studies, short follow-up),
  and SSRIs generally beat behavioural therapy head-to-head [1]. Pitch it as
  practice that helps some men, not a cure.
- Device-assisted, self-controlled start-stop has direct evidence, and it
  leans positive. A small wait-list RCT with a handheld vibrating device (n=11)
  found improvements that held at 6 months, though the sample was too small to
  beat control significantly [5]. A larger RCT (n=50) from the same group had
  men hold a vibrator and move it away themselves as they neared the edge, and
  found large effect sizes persisting to 6 months [6]. In both, the man
  controlled the stop — the device never stopped for him. That's the design to
  follow: the device supplies the stimulation, the man watches his arousal and
  calls the stop. (Caveats: both used a vibrator on the glans, not a stroker
  like the Vacuglide; and the larger trial measured symptoms by questionnaire,
  not stopwatch timing.)
- **Anxiety** is central: it drives PE partly by pulling attention off bodily
  sensation [3]. That's the case against gamifying — a score or a distraction
  has him focused on the wrong thing. Confidence helps, but it comes from
  evidence he can last, not from beating a level.

So the value we can add over "just use Groove" is: (a) teach the technique to
men who don't know it exists, (b) structure the practice, (c) help build arousal
awareness — not tracking, scoring, or automating the stop.

#### Ideas for how to implement

##### Consistent, dial-able stimulus

- **Not a headline feature** — real sex isn't a steady input, and a man can
  become accustomed to a specific stimulus, so it cuts both ways. Inherent in the
  device rather than something to build toward.
- **One useful effect** — because the stimulus is repeatable, a man can notice
  for himself that he's lasting longer than he was.

##### Shaped stop and restart

- **Smooth Stop / gentle Start** — the app controls the motor, so Stop can wind
  down and Start can ramp back gently rather than all-or-nothing, cutting the risk
  of the restart itself tipping him over.
- **Stop is an emergency brake, not the main control** — the man should ease off
  as arousal climbs and only hit Stop when he has to, not flip between full and
  zero.
- **Already exists** — speed control + Stop/Start are built; the training is in
  the framing, teaching him to use them this way.

##### Structured multi-week program

- **Calendar view** — paces practice over weeks; the evidence is built on regular
  repetition.
- **Schedule has evidence behind it** — trials used once daily for two weeks
  (~10–15 min/session, five stops then finish on the sixth) [2], or three times a
  week for six weeks [6]. Base the program length/cadence on these rather than
  picking a number.
- **How to handle performance data?** — some men want it, others would be put off
  or made anxious by it.
  - Hide results during the program, and/or
  - Ask for short subjective feedback after each session rather than showing
    numbers.
- **End-of-program review** — reveal the data and the man's own feedback
  from along the way, so progress surfaces as reassurance at the end rather than a
  running score he watches each day.

##### Pelvic-floor and breathing module

- **Kegels + slow breathing** — adding sphincter/pelvic-floor control roughly
  doubled results in the trial.
- **Separate exercise** — done outside the stop-start session, not during it, so
  it doesn't become an on-screen distraction.

##### No on-screen feedback during play

- **Nothing on screen during the act** — no timer, sparkline, or score; it pulls
  attention off bodily sensation, which is the skill the training is meant to
  build.
- **Data surfaces later** — kept out of the session, shown only in the review.

#### Sources

1. Cooper et al., "Behavioral Therapies for Management of Premature Ejaculation:
   A Systematic Review", Sexual Medicine (2015).
   https://onlinelibrary.wiley.com/doi/full/10.1002/sm2.65
2. "Comparison of the results of stop-start technique with stop-start technique
   and sphincter control training applied in premature ejaculation treatment",
   PLOS ONE (2023).
   https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0283091
3. ISSM, "How Can Anxiety Influence Premature Ejaculation?"
   https://www.issm.info/sexual-health-qa/how-can-anxiety-influence-premature-ejaculation
4. "The Sexual Arousal Scale & How to Balance Your Sexual Focus", End the
   Problem. https://www.endtheproblem.com/the-sexual-arousal-scale-how-to-balance-your-sexual-focus/
5. Jern P., "Evaluation of a behavioral treatment intervention for premature
   ejaculation using a handheld stimulating device", Journal of Sex & Marital
   Therapy, 40(5):358–366 (2014). https://pubmed.ncbi.nlm.nih.gov/24405007/
6. Ventus D. et al., "Vibrator-Assisted Start–Stop Exercises Improve Premature
   Ejaculation Symptoms: A Randomized Controlled Trial", Archives of Sexual
   Behavior (2019). https://link.springer.com/article/10.1007/s10508-019-01520-0
