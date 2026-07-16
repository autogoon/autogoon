"use client";

// The Cumming send-off — the actual release, and the standout ending. Red, to set
// it apart from the FinishButton's amber pre-ending. Pass a `className` for
// width/layout (defaults to full width).

import { Button } from "@/components/button";

export function CummingButton({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void;
  disabled: boolean;
  className?: string;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg bg-linear-to-br from-red-600 to-pink-500 py-3 text-lg font-bold text-white disabled:opacity-50 ${
        className ?? "w-full"
      }`}
      badge="cumming"
    >
      Cumming
    </Button>
  );
}
