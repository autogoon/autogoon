"use client";

// The Companion access gate's UI: enter a shared access ID to unlock Companions
// for a demo. Renders nothing when the gate is off (COMPANIONS_ACCESS_IDS unset)
// or before the initial check resolves, so it never flashes on open builds. The
// real enforcement is server-side on the paid routes (see access-check.ts); this
// only decides whether the Companions feature is revealed.

import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { CompanionsAccess } from "@/hooks/use-companions-access";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import {
  CONTROL_BORDER,
  CONTROL_BUTTON_BASE,
  CONTROL_INPUT,
} from "@/components/controls";

export function CompanionAccessCard({ access }: { access: CompanionsAccess }) {
  const [accessId, setAccessId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (): Promise<void> => {
    const id = accessId.trim();
    if (id === "" || submitting) return;
    setSubmitting(true);
    setFailed(false);
    const ok = await access.unlock(id);
    setSubmitting(false);
    setFailed(!ok);
    if (ok) setAccessId("");
  };

  if (!access.gated || !access.checked) return null;

  return (
    <Card title="Companion access">
      <p className="text-muted-foreground text-sm">
        Companions is locked for this demo. Enter your access ID to unlock it —
        it&apos;s saved on this device, so you only do this once.
      </p>
      {access.granted ? (
        <p className="text-sm text-emerald-500">
          Unlocked — Companions is available on the home screen.
        </p>
      ) : (
        <>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={accessId}
              onChange={(e) => setAccessId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="Access ID"
              spellCheck={false}
              autoComplete="off"
              className={`${CONTROL_INPUT} min-w-0 flex-1`}
            />
            <Button
              onClick={() => void submit()}
              disabled={submitting || accessId.trim() === ""}
              className={`${CONTROL_BUTTON_BASE} flex shrink-0 items-center gap-1.5 ${
                failed ? "border-destructive text-destructive" : CONTROL_BORDER
              }`}
            >
              <KeyRound className="size-4" />
              {submitting ? "Checking…" : "Unlock"}
            </Button>
          </div>
          {failed && (
            <p className="text-destructive text-sm">Incorrect access ID.</p>
          )}
        </>
      )}
    </Card>
  );
}
