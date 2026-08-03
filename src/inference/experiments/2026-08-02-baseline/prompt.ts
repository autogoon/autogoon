// The baseline's prompt — README.md describes what it asks for, and why in that
// order.

export const PROMPT_ONE = `This photo is pose/mood metadata for a companion app: she reads the
caption to pick a picture that fits the moment, so it has to be accurate about pose
and state of undress, not just evocative.

REASONING. Analyze the image and reason about what is shown in the image. Write your reasoning
in as much detail as you need, think carefully about the pose, the clothing, and what is bare or
showing.  Pay particular attention to the direction of body pose, head orientation, gaze, 
and the position of the limbs.  Consider the setting and the light, and how they affect what is visible.
`;

export const PROMPT_TWO = `This photo is pose/mood metadata for a companion app: she reads the
caption to pick a picture that fits the moment, so it has to be accurate about pose
and state of undress, not just evocative.

The description of the image is as follows :

{{DESCRIPTION}}

Work in three steps.

STEP 1 — OBSERVATIONS. Answer each of these on its own line, briefly. Look before
you decide. If something is genuinely ambiguous, say so instead of guessing.
- Support: what is her weight resting on — feet, buttocks, shins/knees, hip, back,
  front, hands?
- Legs: where are the knees, and where are the heels and shins?
- Sitting vs kneeling vs squatting — decide from the support, and say which and why:
  sitting = buttocks on the surface; kneeling = shins/knees on the surface, buttocks
  off it or resting on the heels; squatting = weight on the feet, buttocks unsupported.
- If lying: on her front, back or side? Which end of her is nearest the camera?
- Facing: towards camera / away / profile / three-quarters. Is her torso square to
  the camera or turned, and which way is her head turned?
- Hands: where is each one and what is it doing or touching?
- Clothing: each garment, its specific colour, and how it is arranged — pushed up,
  pulled aside, half off, straps down, unfastened.  Mention topless if there is no
  bra or top, and naked if she is wearing nothing at all.  Mention whether the
  clothing is tight or not.
- Exposed: which parts are bare and how much is actually visible — back, stomach, thighs, buttocks.  Grade each
  one "fully", "partly", "faintly" (made out through fabric or
  in shadow) or "not at all". Never write "not clearly" or similar — if you can make
  it out at all that is "faintly", not "not at all".
- Genitals: if you can clearly see them.
- Breasts: bare and uncovered, or covered by a garment? If bare, say so plainly —
  and say whether both or only one.
- Fabric over her breasts: sheer (skin tone shows through it, as with lace or thin
  wet fabric) or opaque (no skin tone through it, however tightly it fits)? Answer
  this before the next one.
- Nipples: a fitted opaque garment showing the shape of the breast is NOT nipples —
  the outline of a breast is not a nipple, and nor are lace pattern, seams, folds,
  shadow, or the cut of a cup. Say which is true: nipples bare and visible; their
  colour showing through sheer fabric; their shape standing out distinctly against
  otherwise even fabric; unsure; or not visible.
- Setting, and the quality and direction of the light.
- Hair: its colour, and what it is doing — loose or tied, where it falls, whether
  she is holding, lifting or pushing it.
- Gaze direction, expression, overall mood.

STEP 2 — NAKED. From the clothing you just described, answer true or false or unknown:
true if she is wearing nothing at all, false if she is wearing anything.  Wearing
socks or stockings or jewelry is often considering naked. Topless is not naked while
anything else is still on.  Unknown is when you can't see the whole body and can't tell
if she is wearing anything.

STEP 3 — CAPTION. Condense the observations into ONE sentence of roughly 35–45 words,
present tense, no leading pronoun.

Reply in exactly this format, with nothing after the caption line:

OBSERVATIONS:
<your observations>

HAIR: <colour and what it is doing>
GAZE: <direction, expression, mood>
SETTING: <brief description of the setting and light>
NAKED: Yes, No or Unknown
BREAST SIZE: Small, Medium, Large, Very large or Unknown (if you can't tell)
TOPLESS: Yes, No, Unknown (if you can't tell)
NIPPLE VISIBILITY: Bare and visible, Through sheer fabric, Shape visible through opaque fabric, Not visible, Unknown (if you can't tell)
GENITAL VISIBILITY: Visible, Not visible, Unknown (if you can't tell)

CAPTION: <the single caption sentence>`;
