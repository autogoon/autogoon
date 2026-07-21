"use client";

// React state for the Companion access gate. Validates the saved access ID
// against /api/companions/access and exposes whether Companions is unlocked.
// The paid routes enforce the same check server-side, so this is UX only: it
// decides whether the home page reveals Companions, never whether the API is
// reachable.
import { useCallback, useEffect, useState } from "react";
import {
  ACCESS_HEADER,
  getAccessId,
  setAccessId,
} from "@/lib/companions/access";

export type CompanionsAccess = {
  // Has the initial check resolved? Guards against flashing the access card (or
  // Companions) before we know the state.
  checked: boolean;
  // Is the gate on at all? false when COMPANIONS_ACCESS_IDS is unset — the card
  // is hidden and Companions shows unconditionally (dev, tests, CI).
  gated: boolean;
  // Is Companions unlocked right now? Always true when the gate is off.
  granted: boolean;
  // Submit a candidate ID: persist it, re-validate, update state. Resolves true
  // when the ID unlocked (or the gate is off).
  unlock: (id: string) => Promise<boolean>;
};

async function validate(id: string): Promise<{ gated: boolean; ok: boolean }> {
  try {
    const res = await fetch("/api/companions/access", {
      method: "POST",
      headers: { [ACCESS_HEADER]: id },
    });
    const body = (await res.json()) as { gated?: boolean; ok?: boolean };
    return { gated: body.gated ?? true, ok: res.ok && (body.ok ?? false) };
  } catch {
    // Network/parse failure: treat as gated-and-locked so we fail closed.
    return { gated: true, ok: false };
  }
}

export function useCompanionsAccess(): CompanionsAccess {
  const [state, setState] = useState<Omit<CompanionsAccess, "unlock">>({
    checked: false,
    gated: false,
    granted: false,
  });

  // Validate whatever's stored on mount, so a reload restores the unlocked
  // state — and, when the gate is off, reveals Companions with no ID entered.
  useEffect(() => {
    let alive = true;
    void validate(getAccessId()).then(({ gated, ok }) => {
      if (alive) setState({ checked: true, gated, granted: !gated || ok });
    });
    return () => {
      alive = false;
    };
  }, []);

  const unlock = useCallback(async (id: string): Promise<boolean> => {
    setAccessId(id);
    const { gated, ok } = await validate(id);
    setState({ checked: true, gated, granted: !gated || ok });
    return !gated || ok;
  }, []);

  return { ...state, unlock };
}
