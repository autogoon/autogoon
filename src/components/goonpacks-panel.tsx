"use client";

// Goonpacks admin: import packs, see what's installed — and what each pack
// includes or overrides — and remove them. Picking who to play (and which
// variant) stays on the Companions chooser; this screen only manages the
// library. Buttons only, no voice words: importing is a file dialog and
// removal is destructive-ish — neither wants a spoken trigger.

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import {
  useGoonpackLibrary,
  type PackRow,
  type PendingImport,
} from "@/hooks/use-goonpack-library";
import { COMPANIONS } from "@/lib/companions/companions";
import { PackError } from "@/lib/goonpacks/manifest";

// What a pack brings, from its manifest plus the zip-level summary stored at
// import: pictures and prompt live in the zip; the rest are manifest fields.
// For an overlay these are the base's overridden parts; for a complete pack,
// simply its contents.
function contents(row: PackRow): string {
  const parts: string[] = [];
  const s = row.summary;
  const m = row.manifest;
  if (s !== undefined && s.pictures > 0) {
    parts.push(`${s.pictures} picture${s.pictures === 1 ? "" : "s"}`);
  }
  if (s?.hasPrompt === true) parts.push("prompt");
  if (m?.voiceId !== undefined) parts.push("voice");
  if (m?.model !== undefined) parts.push("model");
  if (row.base !== undefined && m?.name !== undefined) parts.push("name");
  if (row.base !== undefined && m?.accentColour !== undefined) {
    parts.push("colour");
  }
  return parts.join(" · ");
}

// A row's accent: the pack's own colour when its manifest names one, else the
// base's (for an overlay) — the same either-or the resolved companion ends up
// wearing. Evicted rows have no manifest to read and stay plain.
function rowAccent(row: PackRow, packs: PackRow[]): string | null {
  if (row.missing) return null;
  if (row.manifest?.accentColour !== undefined) {
    return row.manifest.accentColour;
  }
  if (row.base !== undefined) {
    const builtIn = COMPANIONS[row.base];
    if (builtIn !== undefined) return builtIn.accentColour;
    return (
      packs.find((p) => p.id === row.base)?.manifest?.accentColour ?? "pink"
    );
  }
  return "pink"; // a colourless complete pack — packToCompanion's default
}

export function GoonpacksPanel() {
  const library = useGoonpackLibrary();

  // Pack import. fileRef triggers the hidden file input; pendingImport holds
  // a parsed-but-not-yet-committed import for the confirm sheet; importError
  // surfaces a failed import.
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);
  const onPickFile = useCallback(
    (file: File) => {
      setImportError(null);
      void library
        .importPack(file)
        .then(setPendingImport)
        .catch((e: unknown) =>
          setImportError(e instanceof PackError ? e.message : "import failed"),
        );
    },
    [library],
  );

  return (
    <Card title="Goonpacks">
      <p className="text-muted-foreground text-sm">
        Portable companion packs — a complete companion, or an overlay that
        changes one you have. Manage them here; pick who to play on the
        Companions screen.
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {library.packs.length === 0 && (
          <p className="text-muted-foreground text-sm">No packs imported.</p>
        )}
        {library.packs.map((row) => {
          const what =
            row.base !== undefined
              ? `overlays ${COMPANIONS[row.base]?.name ?? row.base}`
              : "complete companion";
          const inc = contents(row);
          const hasOverlays = library.packs.some((p) => p.base === row.id);
          const accent = rowAccent(row, library.packs);
          return (
            <div
              key={row.id}
              className={
                accent !== null
                  ? `rounded-xl border border-${accent}-500 bg-linear-to-br from-${accent}-500/15 to-${accent}-500/5 px-4 py-3`
                  : "rounded-xl border border-dashed px-4 py-3"
              }
            >
              <div className="flex items-start gap-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {row.name ?? row.id}
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {/* A nameless pack's heading IS the id — don't repeat it. */}
                    {row.name !== undefined ? `${row.id} · ` : ""}
                    {row.version} · {what}
                    {inc !== "" ? ` — ${inc}` : ""}
                  </span>
                  {row.missing && (
                    <span className="text-muted-foreground block text-sm">
                      Gone from browser storage. Re-import her zip.
                    </span>
                  )}
                </span>
                <Button
                  onClick={() => void library.removePack(row.id)}
                  className="text-muted-foreground hover:text-foreground shrink-0 text-sm"
                >
                  Remove{hasOverlays ? " (and her overlays)" : ""}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".zip"
        className="hidden"
        data-testid="goonpack-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f !== undefined) onPickFile(f);
          e.target.value = "";
        }}
      />
      <Button
        onClick={() => fileRef.current?.click()}
        className="text-muted-foreground hover:text-foreground mt-2 rounded-xl border border-dashed px-4 py-2 text-sm"
      >
        Import pack
      </Button>
      {importError !== null && (
        <p className="mt-1 text-sm text-red-500">{importError}</p>
      )}
      {pendingImport !== null && (
        <div className="mt-2 rounded-xl border px-4 py-3 text-sm">
          <p className="font-semibold">
            {pendingImport.manifest.name ?? pendingImport.manifest.id}
            <span className="text-muted-foreground font-normal">
              {" "}
              {pendingImport.manifest.id} · {pendingImport.manifest.version}
              {pendingImport.manifest.base !== undefined
                ? ` · overlays ${pendingImport.manifest.base}`
                : ""}
            </span>
          </p>
          {pendingImport.manifest.description !== undefined && (
            <p className="text-muted-foreground">
              {pendingImport.manifest.description}
            </p>
          )}
          {pendingImport.replaces !== null && (
            <p className="mt-1">
              Replaces {pendingImport.replaces.version}. Threads stay.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() =>
                void pendingImport
                  .commit()
                  .then(() => setPendingImport(null))
                  .catch((e: unknown) => {
                    // A failed store (quota, IDB error) must not strand the
                    // sheet with no feedback.
                    setPendingImport(null);
                    setImportError(
                      e instanceof PackError ? e.message : "import failed",
                    );
                  })
              }
              className="rounded border px-3 py-1"
            >
              {pendingImport.replaces !== null ? "Replace" : "Import"}
            </Button>
            <Button
              onClick={() => setPendingImport(null)}
              className="text-muted-foreground rounded px-3 py-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <p className="text-muted-foreground mt-2 text-xs">
        Packs live in browser storage; keep your zips.
      </p>
    </Card>
  );
}
