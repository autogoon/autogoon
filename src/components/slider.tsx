"use client";

// A minimal range slider — fully controlled, calls onChange with the numeric
// value (already snapped to `step` by the browser).

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.valueAsNumber)}
      className="accent-blue-600 h-2 w-full cursor-pointer"
    />
  );
}
