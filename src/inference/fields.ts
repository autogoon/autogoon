// The field set the corpus is labelled against: what a reviewer is asked, and
// what an experiment's parse() is expected to answer. Data rather than markup,
// because the set grows — docs/2026-08-02-inference-ui-spec.md keeps a record
// with only the fields something has answered, so adding one here leaves every
// existing label valid and simply unanswered for the new field.
//
// Each option carries the key that picks it. Review is driven from the
// keyboard: at a thousand items a saved keystroke is an hour.

export type FieldValue = boolean | string;

export type FieldOption = {
  value: FieldValue;
  label: string;
  // A single lowercase character. Unique across the whole set, not just within
  // a field, since one keypress answers whichever field owns it.
  key: string;
};

export type Field = {
  id: string;
  label: string;
  options: FieldOption[];
};

export const FIELDS: Field[] = [
  {
    id: 'naked',
    label: 'Naked?',
    options: [
      { value: true, label: 'Yes', key: 'y' },
      { value: false, label: 'No', key: 'n' },
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
