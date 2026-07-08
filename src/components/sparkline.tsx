"use client";

// A glanceable step-line sparkline of the upcoming speed over a fixed time
// window. Deliberately minimal — no axes, legend, or hover: it redraws ~10x/sec
// as the script plays, so it's a moving preview, not an interrogable chart.
//
// Colour encodes speed, not identity: a vertical green -> yellow -> red gradient
// mapped to the absolute 0..max axis (green = idle, red = full), so the same
// speed is always the same colour regardless of the pattern's range.

import { useId } from "react";

export type CurvePoint = { t: number; speed: number };

// The look-ahead window the sparkline covers (and the engines build to).
export const UPCOMING_WINDOW_MS = 60_000;

// viewBox units. preserveAspectRatio="none" stretches these to the container; the
// stroke stays crisp via vector-effect and the gradient is vertical so the
// horizontal stretch doesn't distort the colour mapping.
const VIEW_W = 100;
const VIEW_H = 100;

export function Sparkline({
  points,
  max = 100,
  className,
}: {
  points: CurvePoint[];
  max?: number;
  className?: string;
}) {
  const gradientId = useId();
  const domainT = points[points.length - 1]?.t || 1;
  const x = (t: number) => (t / domainT) * VIEW_W;
  const y = (speed: number) =>
    VIEW_H - (Math.max(0, Math.min(max, speed)) / max) * VIEW_H;

  // Step path: hold each speed until the next point's time, then jump.
  let line = "";
  points.forEach((p, i) => {
    const px = x(p.t);
    const py = y(p.speed);
    if (i === 0) {
      line += `M ${px} ${py}`;
    } else {
      line += ` L ${px} ${y(points[i - 1]!.speed)} L ${px} ${py}`;
    }
  });
  const last = points[points.length - 1];
  const first = points[0];
  const area =
    last !== undefined && first !== undefined
      ? `${line} L ${x(last.t)} ${VIEW_H} L ${x(first.t)} ${VIEW_H} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={`h-16 w-full ${className ?? ""}`}
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse so the stops map to the absolute speed axis (y=0 is
            max/red, y=VIEW_H is 0/green), not the path's bounding box. */}
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2={VIEW_H}
        >
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      {area !== "" && (
        <path
          d={area}
          fill={`url(#${gradientId})`}
          opacity={0.15}
          stroke="none"
        />
      )}
      <path
        d={line}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ vectorEffect: "non-scaling-stroke" }}
      />
    </svg>
  );
}
