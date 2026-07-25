'use client';

// Goonpacks admin: import packs, see what's installed — and what each pack
// includes or overrides — and remove them. Picking who to play (and which
// variant) stays on the Companions chooser; this screen only manages the
// library. Buttons only, no voice words: importing is a file dialog and
// removal is destructive-ish — neither wants a spoken trigger.

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import {
  useGoonpackLibrary,
  type PackRow,
  type PendingImport,
} from '@/hooks/use-goonpack-library';
import { COMPANIONS } from '@/lib/companions/companions';
import { keyId, keyVersion, packKey } from '@/lib/goonpacks/entries';
import { PackError } from '@/lib/goonpacks/manifest';

// What a pack brings, from its manifest plus the zip-derived summary:
// pictures and prompt live in the zip; the rest are manifest fields. For an
// overlay these are the base's overridden parts; for a complete pack, simply
// its contents.
function contents(row: PackRow): string {
  const parts: string[] = [];
  const s = row.summary;
  const m = row.manifest;
  if (s !== undefined && s.pictures > 0) {
    parts.push(`${s.pictures} picture${s.pictures === 1 ? '' : 's'}`);
  }
  if (m?.noPictures === true) parts.push('no pictures');
  if (s?.hasPrompt === true) parts.push('prompt');
  if (m?.companion.voiceId !== undefined) parts.push('voice');
  if (m?.companion.model !== undefined) parts.push('model');
  if (m?.base !== undefined && m.companion.accentColour !== undefined) {
    parts.push('colour');
  }
  return parts.join(' · ');
}

// A row's accent: the pack's own colour when its manifest names one, else the
// base's (for an overlay) — the same either-or the resolved companion ends up
// wearing. Incompatible rows stay plain.
function rowAccent(row: PackRow, packs: PackRow[]): string | null {
  const m = row.manifest;
  if (row.incompatible !== undefined || m === undefined) return null;
  if (m.companion.accentColour !== undefined) return m.companion.accentColour;
  if (m.base !== undefined) {
    const builtIn = COMPANIONS[m.base];
    if (builtIn !== undefined) return builtIn.accentColour;
    // Any installed version of the base — newest first is the row order, so
    // find() lands on the newest.
    return (
      packs.find((p) => keyId(p.id) === m.base)?.manifest?.companion
        .accentColour ?? 'pink'
    );
  }
  return 'pink'; // a colourless complete pack — packToCompanion's default
}

// One pack, one card — the admin row and the import confirm sheet render the
// same body, so what the sheet shows is exactly what the installed row will:
// heading + version in the top row (`control` sits at its right edge — the
// row's Remove button), the pack's description, then the info line, with any
// incompatible problems under it. Mirrors the Companions chooser card. Extra
// rows (the sheet's replaces note and buttons) come in as children.
function PackCard({
  row,
  accent,
  control,
  children,
}: {
  row: PackRow;
  accent: string | null;
  control?: ReactNode;
  children?: ReactNode;
}) {
  // An incompatible pack still describes itself as best it can: from its
  // manifest when only cross-pack checks failed, else from the peek. Only a
  // validated pack gets called complete.
  const m = row.manifest;
  // row.id is the storage key (id@version) — split for display.
  const id = m?.id ?? keyId(row.id);
  const name = m?.companion.name ?? row.peek?.name;
  const version = m?.version ?? row.peek?.version ?? keyVersion(row.id);
  const base = m?.base ?? row.peek?.base;
  const about = m?.aboutThePack ?? row.peek?.aboutThePack;
  const info = [
    // The heading is always the id — this page manages packs, and the id is
    // the identity you manage by. The companion's name lives here instead.
    ...(name !== undefined ? [`Provides ${name}`] : []),
    ...(base !== undefined
      ? [`overlays ${COMPANIONS[base]?.name ?? base}`]
      : m !== undefined
        ? ['complete companion']
        : []),
    ...(contents(row) !== '' ? [contents(row)] : []),
  ].join(' · ');
  return (
    <Card
      accent={accent}
      dashed={accent === null}
      title={
        <>
          {id}{' '}
          <span className="text-muted-foreground font-normal">{version}</span>
        </>
      }
      action={control}
    >
      {about !== undefined && <span className="block">{about}</span>}
      {info !== '' && (
        <span className="text-foreground mt-1 block">{info}</span>
      )}
      {row.incompatible !== undefined && (
        <span className="mt-1 block">
          <span className="block text-red-500">Incompatible:</span>
          {row.incompatible.map((p) => (
            <span className="block" key={p}>
              — {p}
            </span>
          ))}
        </span>
      )}
      {children}
    </Card>
  );
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
  const [importError, setImportError] = useState<string[] | null>(null);
  const onPickFile = useCallback(
    (file: File) => {
      setImportError(null);
      void library
        .importPack(file)
        .then(setPendingImport)
        .catch((e: unknown) =>
          setImportError(
            e instanceof PackError ? e.problems : ['Import failed.'],
          ),
        );
    },
    [library],
  );

  return (
    <Panel>
      <Card title="Goonpacks">
        <p>
          Portable companion packs — a complete companion, or an overlay that
          changes one you have. Manage them here; pick who to play on the
          Companions screen.
        </p>

        <div className="mt-2 flex flex-col gap-2">
          {library.status === 'loading' ? (
            <p>Checking packs…</p>
          ) : library.packs.length === 0 ? (
            <p>No packs imported.</p>
          ) : (
            library.packs.map((row) => (
              <PackCard
                key={row.id}
                row={row}
                accent={rowAccent(row, library.packs)}
                control={
                  <Button
                    onClick={() => void library.removePack(row.id)}
                    className="text-sm"
                  >
                    Remove
                  </Button>
                }
              />
            ))
          )}
        </div>
      </Card>

      <Card title="Import">
        <p>Packs live in browser storage; keep your zips.</p>

        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          data-testid="goonpack-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f !== undefined) onPickFile(f);
            e.target.value = '';
          }}
        />

        <Button onClick={() => fileRef.current?.click()}>Import pack</Button>

        {importError?.map((p) => (
          <p key={p} className="mt-1 text-sm text-red-500">
            {p}
          </p>
        ))}

        {pendingImport !== null &&
          (() => {
            // The sheet renders the same PackCard the list will once the pack
            // is committed — a synthetic row from the parsed import.
            const sheetRow: PackRow = {
              id: packKey(pendingImport.manifest),
              manifest: pendingImport.manifest,
              summary: pendingImport.summary,
            };
            return (
              <PackCard
                row={sheetRow}
                accent={rowAccent(sheetRow, library.packs)}
              >
                {pendingImport.replaces && (
                  <p className="mt-1 text-sm">
                    Replaces the installed pack. Threads stay.
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
                            e instanceof PackError
                              ? e.problems
                              : ['Import failed.'],
                          );
                        })
                    }
                  >
                    {pendingImport.replaces ? 'Replace' : 'Import'}
                  </Button>
                  <Button onClick={() => setPendingImport(null)}>Cancel</Button>
                </div>
              </PackCard>
            );
          })()}
      </Card>
    </Panel>
  );
}
