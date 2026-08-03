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

export type Field = {
  id: string;
  label: string;
  options: FieldOption[];
};

// The answer for a picture the field cannot be read off. A value like any
// other, on whichever fields offer it — an experiment answering `Yes` where a
// person answered this is one that got it wrong, which is the whole point of
// being able to record it.
export const UNKNOWN = 'unknown';

export const FIELDS: Field[] = [
  {
    id: 'naked',
    label: 'Naked?',
    options: [
      { value: true, label: 'Yes' },
      { value: false, label: 'No' },
      { value: UNKNOWN, label: 'Unknown' },
    ],
  },
  {
    id: 'breastSize',
    label: 'Breast size?',
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
];

export const fieldById = (id: string): Field | undefined =>
  FIELDS.find((f) => f.id === id);

// How a stored value reads on screen. A value no option matches is shown as
// itself rather than hidden: a field whose options changed after labelling
// should look wrong, not look absent.
export function optionLabel(field: Field, value: FieldValue): string {
  return field.options.find((o) => o.value === value)?.label ?? String(value);
}
