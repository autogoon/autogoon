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
  // Has the initial check resolved? Guards against flashing Companions before we
  // know whether the stored ID is valid.
  checked: boolean;
  // Is Companions unlocked right now? True ONLY when the stored ID matches a
  // configured access ID — fail closed, nothing-configured means never, even on
  // the dev server (the validation route is strict so the Settings box tests
  // real IDs; dev's always-visible Companions card is page.tsx's doing).
  granted: boolean;
  // Submit a candidate ID: persist it, re-validate, update state. Resolves true
  // when the ID unlocked.
  unlock: (id: string) => Promise<boolean>;
};

async function validate(id: string): Promise<boolean> {
  try {
    const res = await fetch("/api/companions/access", {
      method: "POST",
      headers: { [ACCESS_HEADER]: id },
    });
    const body = (await res.json()) as { ok?: boolean };
    return res.ok && (body.ok ?? false);
  } catch {
    // Network/parse failure: fail closed.
    return false;
  }
}

export function useCompanionsAccess(): CompanionsAccess {
  const [state, setState] = useState<Omit<CompanionsAccess, "unlock">>({
    checked: false,
    granted: false,
  });

  // Validate whatever's stored on mount, so a reload restores the unlocked state
  // when (and only when) the stored ID is still valid.
  useEffect(() => {
    let alive = true;
    void validate(getAccessId()).then((granted) => {
      if (alive) setState({ checked: true, granted });
    });
    return () => {
      alive = false;
    };
  }, []);

  const unlock = useCallback(async (id: string): Promise<boolean> => {
    setAccessId(id);
    const granted = await validate(id);
    setState({ checked: true, granted });
    return granted;
  }, []);

  return { ...state, unlock };
}
