// A minimal range slider — fully controlled, calls onChange with the numeric
// value (already snapped to `step` by the browser).

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.valueAsNumber)}
      className="h-2 w-full cursor-pointer accent-blue-600 disabled:cursor-default disabled:opacity-50"
    />
  );
}
