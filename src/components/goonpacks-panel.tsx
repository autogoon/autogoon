// Goonpacks admin: import packs, see what's installed — and what each pack
// includes or overrides — and remove them. Picking who to play (and which
// variant) stays on the Companions chooser; this screen only manages the
// library. Buttons only, no voice words: importing is a file dialog and
// removal deletes an installed pack — neither gets a spoken trigger.

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { HardDrive } from 'lucide-react';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import {
  useGoonpackLibrary,
  type PackRow,
  type PendingImport,
} from '@/hooks/use-goonpack-library';
import { COMPANIONS } from '@/lib/companions/companions';
import {
  describeMedia,
  keyId,
  keyVersion,
  newestFirst,
  packKey,
} from '@/lib/goonpacks/entries';
import type { ImportStage } from '@/lib/goonpacks/import';
import { PackError } from '@/lib/goonpacks/manifest';

// What a pack brings, from its manifest plus the tree-derived summary: media
// and prompt live in the pack's tree; the rest are manifest fields. For an
// overlay these are the base's overridden parts; for a complete pack, simply
// its contents.
function contents(row: PackRow): string {
  const parts: string[] = [];
  const s = row.summary;
  const m = row.manifest;
  if (s !== undefined && describeMedia(s.media) !== '') {
    parts.push(describeMedia(s.media));
  }
  if (m?.noMedia === true) parts.push('no media');
  if (s?.hasPrompt === true) parts.push('prompt');
  if (m?.companion.voiceId !== undefined) parts.push('voice');
  if (m?.model !== undefined) parts.push('model');
  if (m?.base !== undefined && m.companion.accentColour !== undefined) {
    parts.push('colour');
  }
  return parts.join(' · ');
}

// A row's accent: the pack's own colour when its manifest names one, else the
// base's (for an overlay) — the same either-or the resolved companion ends up
// wearing. Incompatible rows stay plain.
export function rowAccent(row: PackRow, packs: PackRow[]): string | null {
  const m = row.manifest;
  if (row.incompatible !== undefined || m === undefined) return null;
  if (m.companion.accentColour !== undefined) return m.companion.accentColour;
  if (m.base !== undefined) {
    const builtIn = COMPANIONS[m.base];
    if (builtIn !== undefined) return builtIn.accentColour;
    // The newest installed version of the base — the one the resolved
    // companion is built from (buildEntries sorts versions newest first).
    // Compared rather than taken by position: the rows are ordered oldest
    // version first, and nothing ties that order to this.
    const newest = packs
      .filter((p) => keyId(p.id) === m.base)
      .sort((a, b) => newestFirst(keyVersion(a.id), keyVersion(b.id)))[0];
    return newest?.manifest?.companion.accentColour ?? 'pink';
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

// `active` is whether this is the screen being looked at. It builds the pack
// index on first sight rather than at startup; every other panel takes the same
// prop for its own reasons.
export function GoonpacksPanel({ active }: { active: boolean }) {
  const library = useGoonpackLibrary(active);

  // Pack import. fileRef triggers the hidden file input; pendingImport holds
  // a parsed-but-not-yet-committed import for the confirm sheet; importError
  // surfaces a failed import.
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(
    null,
  );
  const [importError, setImportError] = useState<string[] | null>(null);
  // Non-null while a commit is running — extraction has no cancel, so the
  // sheet's buttons are held until it finishes.
  const [progress, setProgress] = useState<ImportStage | null>(null);
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
          ) : library.status === 'error' ? (
            <p>
              Browser storage couldn&apos;t be read, so packs can&apos;t be
              listed — reloading usually clears it.
            </p>
          ) : library.packs.length === 0 ? (
            <p>No packs imported.</p>
          ) : (
            library.packs.map((row) => (
              <PackCard
                key={row.id}
                row={row}
                accent={rowAccent(row, library.packs)}
                control={
                  library.onDisk.has(row.id) ? (
                    // A pack read straight out of goonpacks/ on a dev server.
                    // Remove empties a pack out of browser storage, and this
                    // one isn't there — it is removed by deleting the
                    // directory, and pressing a button would delete nothing
                    // and watch the pack come back on the next build.
                    <span
                      className="text-muted-foreground flex items-center gap-1.5 text-sm"
                      title="Read from goonpacks/ on this machine"
                    >
                      <HardDrive className="size-4" />
                      on disk
                    </span>
                  ) : (
                    <Button
                      onClick={() => void library.removePack(row.id)}
                      className="text-sm"
                      // Removing a pack while another is unpacking would rebuild
                      // the index out from under the import.
                      disabled={progress !== null}
                    >
                      Remove
                    </Button>
                  )
                }
              />
            ))
          )}
        </div>
      </Card>

      <Card title="Import">
        <p>
          Packs are unpacked into your browser&apos;s storage; keep your zips.
        </p>

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
          <p
            key={p}
            data-testid="import-error"
            className="mt-1 text-sm text-red-500"
          >
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
                    onClick={() => {
                      setProgress({
                        phase: 'extracting',
                        bytes: 0,
                        total: 1,
                      });
                      void pendingImport
                        .commit(setProgress)
                        .then(() => {
                          setPendingImport(null);
                          setProgress(null);
                        })
                        .catch((e: unknown) => {
                          // A failed import (quota, a bad tree) must not strand
                          // the sheet with no feedback.
                          setPendingImport(null);
                          setProgress(null);
                          setImportError(
                            e instanceof PackError
                              ? e.problems
                              : ['Import failed.'],
                          );
                        });
                    }}
                    disabled={progress !== null}
                  >
                    {pendingImport.replaces ? 'Replace' : 'Import'}
                  </Button>
                  <Button
                    onClick={() => setPendingImport(null)}
                    disabled={progress !== null}
                  >
                    Cancel
                  </Button>
                </div>
                {progress !== null && (
                  <p className="mt-1 text-sm">
                    {progress.phase === 'checking'
                      ? 'Checking the pack…'
                      : `Unpacking… ${Math.round((progress.bytes / Math.max(progress.total, 1)) * 100)}%`}
                  </p>
                )}
              </PackCard>
            );
          })()}
      </Card>
    </Panel>
  );
}
