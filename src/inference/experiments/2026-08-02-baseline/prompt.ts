// The baseline's prompt — README.md describes what it asks for, and why in that
// order.
//
// Breast size is answered in PROMPT_ONE and copied through by PROMPT_TWO, which
// is never sent the picture. It is a magnitude, and a magnitude is not in
// anybody's prose account of a picture — the second call was inventing one. The
// other answers are read off the clothing and pose PROMPT_ONE describes, which
// text does carry.

export const PROMPT_ONE = `This photo is pose/mood metadata for a companion app: she reads the
caption to pick a picture that fits the moment, so it has to be accurate about pose
and state of undress, not just evocative.

STEP 1 - REASONING. Analyze the image and reason about what is shown in the image. Write your reasoning
in as much detail as you need, think carefully about the pose, the clothing, and what is bare or
showing.  Pay particular attention to the direction of body pose, head orientation, gaze, 
and the position of the limbs.  Consider the setting and the light, and how they affect what is visible.

Can you read any text in the image?  If so, what does it say?  Carefully transcribe it.

Clothing is important, and you should consider whether the subject is wearing a bra or panties,
and if so, whether they are sheer or see through.  If you can't tell, say so.

The clothing description should include each garment, the fabric and texture, colour, and how it is
arranged, the length of it (specifically, is her dress or skirt long or short.)  Is it sheer or opaque?
Is it tight or loose?  Is it arranged to show or hide the body?   Can you see up on down her dress?
Specifically mention if clothing is covering the breasts, nipples, or genitals.  If you can't tell, say so.

Body parts are only exposed if the skin of them is visible.  if you can see the skin through sheer or
see through clothing, that counts as exposed. If you can only see the shape of the boy part mention that,
but do not say they are exposed.  If you can't tell, say so.

Can you see genitals?  If you can see a vagina, an anus, a penis, or a combination?  What are they doing?

Only say if breasts are bare unless you can see the skin and full shape of at least one of them.  If the
subject isn't wearing a bra or you can see cleavage, it's not necessarily the case that her breasts are bare.
If you can't tell, say so.

Sexual activity, is there any going on, description in detail.  If you can't tell, say so.

Breast size.  Are they small, medium, large, very large or unknown, judged by what you can see:

- Small: modest volume beyond the ribcage line.
- Medium: the breast projects well past the ribcage line in profile, or fills the width of the
  torso, or displaces the garment noticeably. 
- Large: the breast dominates the torso, straining or reshaping whatever covers it.
- Very large: completely disproportionate to the torso, or fat spilling out of the garment, or otherwise obviously very large.

Do not pick Medium because you are unsure — Unknown is the
answer for unsure.

IMPORTANT: Explain your breast size reasoning in detail in the reasoning section.

Then finish with this line, after everything else. Nobody after you sees the picture, so
this one is yours to answer and it is recorded as you write it.

Reply in exactly this format, with nothing after the breast size line:

REASONING: <your reasoning, in as much detail as you need>

BREAST SIZE: <Small, Medium, Large, Very large or Unknown>
TEXT: <Any text that appears in the image>
`;

export const PROMPT_TWO = `This photo is pose/mood metadata for a companion app: she reads the
caption to pick a picture that fits the moment, so it has to be accurate about pose
and state of undress, not just evocative.

The description of the image is as follows :

{{DESCRIPTION}}

BREAST SIZE is already answered in the description, and you are copying it, not
deciding it. Take it exactly as the description gives it, including Unknown, and
answer Unknown where the description carries no such line. Do not work it out from
the rest of the description — whoever wrote it could see the picture and you cannot.

Work in two steps.

STEP 1 - REASONING.  You are juding the following individually :

HAIR: Describe the colour and the style, and how it is arranged.
GAZE: Is the subject looking at the camera, away, down, or up? What is the expression and mood?
SETTING: Describe where the photo is taken, and the light. Is it indoors or outdoors? What time of day? What is in the background?  What secual activity, if any, is going on?
BODY SHAPE: Describe the body shape, including height, weight, and build. Is it athletic, curvy, thin, or muscular?
CLOTHING: Describe the clothing you can see, each garment, it's colour, how long it is, and how it is arranged. Is it sheer or opaue? Is it tight or loose? Is it arranged to show or hide the body?  Can you see up on down her dress?
EXPOSED: Which body parts are bare and how much is actually visible — For example, but not exclusively, back, stomach, thighs, buttocks, cleavage, breasts, legs, face, hands.
NAKED: Is the subject naked? A subject can be naked if she's wearing socks, stockings and/or jewelry, but not usually if she's wearing any other clothing. Yes, No or Unknown (if you can't tell)
WEARING BRA: Is she wearing a bra?  This includes sheer or see through bras.
WEARING PANTIES: Is she wearing panties or knickers.  This includes sheer or see through panties.
TOPLESS: Topless means that subject isn't wearing a bra or not.  It's possible for the subject to be topless even if you can't see your breasts.
NIPPLE VISIBILITY: Are the nipples full visible, you can see through fabric to see them (sheer or see through bra or top), can you see just the shape (erect or pokies, usually the shape will be the same colour as the clothing.)
GENITAL VISIBILITY: Can you see the subject's genitals?  Can you see a vagina, an anus, a penis or a combination?

For each entry, describe your reasoning in detail.

STEP 2 — OBSERVATIONS. Answer each of these on its own line, briefly. Look before
you decide. If something is genuinely ambiguous, say so instead of guessing.

STEP 3 — CAPTION. Condense the observations into roughly 50 words, the caption should be a set of terse descriptions of things in the image.  No prose or flowery language, no leading pronouns,
the caption is used for keyword search.  If there is sexual activity, describe it.  If there are genitals, mention what specifically you can see (penis, vagina), don't use the
word genitals or genitalia.

Every phrase names something that is in the picture. Before you write a phrase, check it
for the words "no", "not", "without", or an ending like "-less" — if it needs one of
those, drop the whole phrase. It is a search index: "no bra visible" puts the word bra
into it, and the picture is then found by someone looking for a bra. What is absent is
already recorded in the marked answers above, so nothing is lost by leaving it out.

Right: "small breasts, black bra, brunette hair, looking away, indoor setting, wearing short dress, exposed thighs, partially visible cleavage, wearing bra and panties."
Wrong: "A woman with a black dress and long hair is standing in a room, looking away from the camera. She has small breasts and is wearing a bra and panties."
Wrong: "No bra, no genitals, no sexual activity"
Wrong: "no visible breasts, no visible face, no sexual activity, no bra visible"
Wrong: "Genitalia visible"

Reply in exactly this format, with nothing after the caption line:

REASONING: <your reasoning, in as much detail as you need>

OBSERVATIONS:
HAIR: <hair description>
GAZE: <gaze description>
SETTING: <setting description>
BODY SHAPE: <body shape description>
CLOTHING: <each garment, its colour, and how it is arranged>
EXPOSED: <which body parts are bare and how much is actually visible.  Grade each one "fully", "partly", "faintly" (made out through fabric or in shadow) or "not at all". Never write "not clearly" or similar — if you can make it out at all that is "faintly", not "not at all".>
NAKED: Yes, No or Unknown
BREAST SIZE: <copied from the description, or Unknown if it carries none>
WEARING BRA: Yes, No or Unknown (if you can't tell)
WEARING PANTIES: Yes, No or Unknown (if you can't tell)
TOPLESS: Yes, No, Unknown (if you can't tell)
NIPPLE VISIBILITY: Bare and visible, Through sheer fabric, Shape visible through opaque fabric, Not visible, Unknown (if you can't tell)
GENITAL VISIBILITY: Visible, Not visible, Unknown (if you can't tell)
TEXT: <copied from the description>

CAPTION: <the single caption sentence>`;
