// The field set the corpus is labelled against: what a reviewer is asked, and
// what an experiment's parse() is expected to answer. Data rather than markup,
// because the set grows — docs/2026-08-02-inference-ui-spec.md keeps a record
// with only the fields something has answered, so adding one here leaves every
// existing label valid and simply unanswered for the new field.
//
// Order is meaningful in both directions. Review is driven from the keyboard —
// at a thousand items a saved keystroke is an hour — and the arrows walk this
// structure: up and down the fields in the order they sit here, left and right
// along a field's options in the order they sit there. So a field's options
// read in one direction, weakest first.

export type FieldValue = boolean | string;

export type FieldOption = {
  value: FieldValue;
  label: string;
};

// Two kinds, because two kinds of question. A **choice** is answered with one
// of a named set, which is what makes it scoreable: an experiment's answer is
// right or wrong against a person's. **Text** is answered in words, and nothing
// compares two of those — it is recorded because it is worth having beside the
// picture, not because it can be marked.
//
// The kind decides the whole of how a field behaves: the arrows walk a choice's
// options and open a text field's editor, compare gathers exemplars by a
// choice's value and has nothing to gather for text, and the summary tallies a
// choice across its options and text as answered or not.
type Asked = { id: string; label: string };

export type Field =
  | (Asked & { kind: 'choice'; options: FieldOption[] })
  // Two separate things, one about typing and one about reading. `multiline` is
  // how the answer is typed: a caption is one sentence and a description is
  // paragraphs, and a single-line box is wrong for the second. `whole` is how
  // much of it the review row shows — every other answer is clipped to keep the
  // rows scannable, and a field nobody can judge without reading all of it says
  // so here.
  | (Asked & { kind: 'text'; multiline?: true; whole?: true });

// A field that has options, for the screens that only work on one — compare
// gathers exemplars by value, so it is handed one of these rather than
// re-deciding.
export type ChoiceField = Extract<Field, { kind: 'choice' }>;

// The answer for a picture the field cannot be read off. A value like any
// other, on whichever fields offer it — an experiment answering `Yes` where a
// person answered this is one that got it wrong, which is the whole point of
// being able to record it.
export const UNKNOWN = 'unknown';

// Yes, no, or the picture won't say. Written once because five fields ask it.
const YES_NO: FieldOption[] = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
  { value: UNKNOWN, label: 'Unknown' },
];

export const FIELDS: Field[] = [
  { id: 'hair', label: 'Hair', kind: 'text' },
  { id: 'gaze', label: 'Gaze', kind: 'text' },
  { id: 'setting', label: 'Setting', kind: 'text' },
  { id: 'bodyShape', label: 'Body shape', kind: 'text' },
  { id: 'clothing', label: 'Clothing', kind: 'text' },
  { id: 'exposed', label: 'Exposed', kind: 'text' },
  { id: 'naked', label: 'Naked?', kind: 'choice', options: YES_NO },
  {
    id: 'breastSize',
    label: 'Breast size?',
    kind: 'choice',
    // Four buckets rather than a cup size: what a reviewer can read off a
    // photograph consistently is a bucket, and ground truth two people would
    // label differently scores nothing.
    options: [
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Large' },
      { value: 'veryLarge', label: 'Very large' },
      { value: UNKNOWN, label: 'Unknown' },
    ],
  },
  {
    id: 'wearingBra',
    label: 'Wearing a bra?',
    kind: 'choice',
    options: YES_NO,
  },
  {
    id: 'wearingPanties',
    label: 'Wearing panties?',
    kind: 'choice',
    options: YES_NO,
  },
  { id: 'topless', label: 'Topless?', kind: 'choice', options: YES_NO },
  {
    id: 'nippleVisibility',
    label: 'Nipples?',
    kind: 'choice',
    // Weakest first, as everywhere: right walks from not visible towards bare,
    // so the arrow's direction means more exposed throughout the set. The
    // labels are short because they sit in a row of five buttons; what each
    // means at length is in the prompt that asks for it.
    options: [
      { value: 'notVisible', label: 'No' },
      { value: 'shapeThroughOpaque', label: 'Pokie' },
      { value: 'throughSheer', label: 'See through' },
      { value: 'bare', label: 'Yes' },
      { value: UNKNOWN, label: 'Unknown' },
    ],
  },
  {
    id: 'genitalVisibility',
    label: 'Genitals?',
    kind: 'choice',
    options: [
      { value: 'notVisible', label: 'Not visible' },
      { value: 'visible', label: 'Visible' },
      { value: UNKNOWN, label: 'Unknown' },
    ],
  },
  // The two a pack plays. They are labelled like anything else, so an
  // experiment's caption can be read against one somebody wrote. The caption is
  // shown whole: it is the sentence the whole pipeline exists to produce, and a
  // clipped one can't be judged.
  { id: 'caption', label: 'Caption', kind: 'text', whole: true },
  { id: 'description', label: 'Description', kind: 'text', multiline: true },
];

export const fieldById = (id: string): Field | undefined =>
  FIELDS.find((f) => f.id === id);

// How a stored value reads on screen. A value no option matches is shown as
// itself rather than hidden: a field whose options changed after labelling
// should look wrong, not look absent. A text field's answer is already its own
// label.
export function optionLabel(field: Field, value: FieldValue): string {
  if (field.kind === 'text') return String(value);
  return field.options.find((o) => o.value === value)?.label ?? String(value);
}
