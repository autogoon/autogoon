// The baseline's prompt — README.md describes what it asks for, and why in that
// order.

export const PROMPT_ONE = `This photo is pose/mood metadata for a companion app: she reads the
caption to pick a picture that fits the moment, so it has to be accurate about pose
and state of undress, not just evocative.

REASONING. Analyze the image and reason about what is shown in the image. Write your reasoning
in as much detail as you need, think carefully about the pose, the clothing, and what is bare or
showing.  Pay particular attention to the direction of body pose, head orientation, gaze, 
and the position of the limbs.  Consider the setting and the light, and how they affect what is visible.

Breast size grading, but only if you can see the breast size clearly : 

- Small (Flat, nearly flat A or B-cup)
- Medium (C or D cup, visible volume, proportional to the body size)
- Large (E or F cup, prominent, starting to look large vs the body size)
- Very large (G cup or larger, disproptional to the body size or incredibly prominent size)

Clothing is important, and you should consider whether the subject is wearing a bra or panties,
and if so, whether they are sheer or see through.  If you can't tell, say so.

The clothing description should include each garment, the fabric and texture, colour, and how it is
arranged.  Is it sheer or opaque?  Is it tight or loose?  Is it arranged to show or hide the body? 
Can you see up on down her dress?  Specifically mention if clothing is covering the breasts, nipples,
or genitals.  If you can't tell, say so.

Only say her breasts are bare unless you can see the full shape of at least one of them.  If the subject
isn't wearing a bra or you can see cleavage, it's not necessarily the case that her breasts are bare.
If you can't tell, say so.

Sexual activity, is there any going on, description in detail.  If you can't tell, say so.
`;

export const PROMPT_TWO = `This photo is pose/mood metadata for a companion app: she reads the
caption to pick a picture that fits the moment, so it has to be accurate about pose
and state of undress, not just evocative.

The description of the image is as follows :

{{DESCRIPTION}}

Work in two steps.

STEP 1 - REASONING.  You are juding the following individually :

HAIR: Describe the colour and the style, and how it is arranged.
GAZE: Is the subject looking at the camera, away, down, or up? What is the expression and mood?
SETTING: Describe where the photo is taken, and the light. Is it indoors or outdoors? What time of day? What is in the background?  What secual activity, if any, is going on?
BODY SHAPE: Describe the body shape, including height, weight, and build. Is it athletic, curvy, thin, or muscular?
CLOTHING: Describe the clothing you can see, each garment, it's colour, and how it is arranged. Is it sheer or opaue? Is it tight or loose? Is it arranged to show or hide the body?  Can you see up on down her dress?
EXPOSED: Which body parts are bare and how much is actually visible — For example, but not exclusively, back, stomach, thighs, buttocks, cleavage, breasts, legs, face, hands.
NAKED: Is the subject naked? A subject can be naked if she's wearing socks, stockings and/or jewelry, but not usually if she's wearing any other clothing. Yes, No or Unknown (if you can't tell)
BREAST SIZE: How large are her breasts?  Consider Small (A or B-cup), Medium (C or D cup, visible volume), Large (E or F cup, prominent), Very large (G cup or larger, disproptional to the body size or incredibly prominent size.)
WEARING BRA: Is she wearing a bra?  This includes sheer or see through bras.
WEARING PANTIES: Is she wearing panties or knickers.  This includes sheer or see through panties.
TOPLESS: Topless means that the breasts are bare, not covered by a bra or other clothing.
NIPPLE VISIBILITY: Are the nipples full visible, you can see through fabric to see them (sheer or see through bra or top), can you see just the shape (erect or pokies, usually the shape will be the same colour as the clothing.)
GENITAL VISIBILITY: Can you see the subject's genitals?

For each entry, describe your reasoning in detail.

STEP 2 — OBSERVATIONS. Answer each of these on its own line, briefly. Look before
you decide. If something is genuinely ambiguous, say so instead of guessing.

STEP 3 — CAPTION. Condense the observations into ONE sentence of roughly 50 words,
present tense, no leading pronoun.  Try and include all parts of your observations.  The caption should be tersely descriptive, but not flowery or poetic, it is used with keyword search.
Be more verbose about body pose and state of undress than about the setting, and don't include any information that isn't visible in the image.  There is
not need to mention things are are not in the image or not visible it not confirmed.

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
BREAST SIZE: Small, Medium, Large, Very large or Unknown (if you can't tell)
WEARING BRA: Yes, No or Unknown (if you can't tell)
WEARING PANTIES: Yes, No or Unknown (if you can't tell)
TOPLESS: Yes, No, Unknown (if you can't tell)
NIPPLE VISIBILITY: Bare and visible, Through sheer fabric, Shape visible through opaque fabric, Not visible, Unknown (if you can't tell)
GENITAL VISIBILITY: Visible, Not visible, Unknown (if you can't tell)

CAPTION: <the single caption sentence>`;
