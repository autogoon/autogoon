"use client";

// A glanceable step-line sparkline of the upcoming speed over a fixed time
// window. Deliberately minimal — no axes, legend, or hover: it redraws ~10x/sec
// as the script plays, so it's a moving preview, not an interrogable chart.
//
// Colour encodes speed, not identity: a vertical green -> yellow -> red gradient
// mapped to the absolute 0..max axis (green = idle, red = full), so the same
// speed is always the same colour regardless of the pattern's range.

import { useId } from "react";
import type { CurvePoint, ValveMarker } from "@/lib/program";

// viewBox units. preserveAspectRatio="none" stretches these to the container; the
// stroke stays crisp via vector-effect and the gradient is vertical so the
// horizontal stretch doesn't distort the colour mapping.
const VIEW_W = 100;
// The speed graph fills SPEED_H; the valve lane sits in its own strip BELOW it,
// with a blank gap so the two never touch, and VIEW_H is taller to make room.
// Units are viewBox units; at the rendered height (~0.64px/unit) the gap is ~1px
// and the lane ~2px. stroke − is red, stroke + green.
const SPEED_H = 100;
const VALVE_GAP = 2;
const VALVE_LANE_H = 3;
const VIEW_H = SPEED_H + VALVE_GAP + VALVE_LANE_H;
const VALVE_MIN_W = 0.6; // keep very short pulses visible after horizontal squash
const VALVE_COLOUR = { minus: "#ef4444", plus: "#22c55e" } as const;

export function Sparkline({
  points,
  valves = [],
  max = 100,
  className,
}: {
  points: CurvePoint[];
  valves?: ValveMarker[];
  max?: number;
  className?: string;
}) {
  const gradientId = useId();
  const domainT = points[points.length - 1]?.t || 1;
  const x = (t: number) => (t / domainT) * VIEW_W;
  const y = (speed: number) =>
    SPEED_H - (Math.max(0, Math.min(max, speed)) / max) * SPEED_H;

  // Pair each valve's open → close into a drawable span. A dangling open (close
  // is beyond the window) runs to the window end; a close with no open in-window
  // means the valve was already open at t=0, so the span starts there.
  const spans: Array<{ from: number; to: number; valve: "plus" | "minus" }> =
    [];
  const openAt: { plus: number | null; minus: number | null } = {
    plus: null,
    minus: null,
  };
  for (const v of valves) {
    if (v.open) {
      openAt[v.valve] = v.t;
    } else {
      spans.push({ from: openAt[v.valve] ?? 0, to: v.t, valve: v.valve });
      openAt[v.valve] = null;
    }
  }
  for (const valve of ["plus", "minus"] as const) {
    const from = openAt[valve];
    if (from !== null) spans.push({ from, to: domainT, valve });
  }

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
      ? `${line} L ${x(last.t)} ${SPEED_H} L ${x(first.t)} ${SPEED_H} Z`
      : "";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={`h-[67px] w-full ${className ?? ""}`}
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse so the stops map to the absolute speed axis (y=0 is
            max/red, y=SPEED_H is 0/green), not the path's bounding box. */}
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2={SPEED_H}
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
      {spans.map((s) => {
        const rx = x(s.from);
        return (
          <rect
            key={`${s.valve}-${s.from}-${s.to}`}
            x={rx}
            y={VIEW_H - VALVE_LANE_H}
            width={Math.max(VALVE_MIN_W, x(s.to) - rx)}
            height={VALVE_LANE_H}
            fill={VALVE_COLOUR[s.valve]}
          />
        );
      })}
    </svg>
  );
}
