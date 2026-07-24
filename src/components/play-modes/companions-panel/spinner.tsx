"use client";

// A small inline "in progress" spinner for the pending LLM / TTS states.

export function Spinner() {
  return (
    <span
      role="status"
      aria-label="loading"
      className="border-foreground/30 border-t-foreground inline-block h-3 w-3 animate-spin rounded-full border-2"
    />
  );
}
