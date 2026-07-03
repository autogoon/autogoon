"use client";

// A single segmented control: a row of mutually-exclusive options. Generic over
// the option value; the selected one gets `activeClass`.

import { Button } from "@/components/button";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  activeClass,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  activeClass: string;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border">
      {options.map((opt, i) => (
        <Button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-3 ${i > 0 ? "border-l" : ""} ${
            value === opt.value ? activeClass : "text-muted-foreground"
          }`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
