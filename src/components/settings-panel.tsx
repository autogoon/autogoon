// The Settings screen — app-level preferences and diagnostics, reached from
// home. Appearance and the build info live here; per-play-mode options belong
// in that play mode's setup view instead.

import { useEffect, useState } from 'react';
import type { CompanionsAccess } from '@/hooks/use-companions-access';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import { CompanionAccessCard } from '@/components/companion-access-card';
import { ListenOnLoadField } from '@/components/listen-on-load-field';
import { SafeWordField } from '@/components/safe-word-field';
import { ThemeToggle } from '@/components/theme-toggle';

// Build stamp, baked into the bundle by next.config at build time. On Vercel the
// SHA/ref come from the deploy's commit; locally both read "dev". The build time
// is a fixed ISO instant that we format in the viewer's local timezone — done in
// an effect (client-only) so the server and client renders can't disagree.
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev';
const gitRef = process.env.NEXT_PUBLIC_GIT_REF ?? 'dev';
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? '';
const shortSha = gitSha === 'dev' ? 'dev' : gitSha.slice(0, 7);

export function SettingsPanel({
  safeWord,
  sanitizeSafeWord,
  onSaveSafeWord,
  access,
}: {
  safeWord: string;
  sanitizeSafeWord: (input: string) => string | null;
  onSaveSafeWord: (word: string) => void;
  access: CompanionsAccess;
}) {
  // Local-time build stamp, resolved after mount (see the note above).
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  useEffect(() => {
    if (buildTime === '') return;
    setBuiltAt(
      new Date(buildTime).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    );
  }, []);

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <Card title="Appearance">Light, dark, or follow the system.</Card>
        <ThemeToggle />
      </div>

      <Card title="Microphone">
        Whether opening the app starts listening for spoken commands, or waits
        until you press Listen.
        <ListenOnLoadField />
      </Card>

      <Card title="Safe word">
        <SafeWordField
          safeWord={safeWord}
          sanitize={sanitizeSafeWord}
          onSave={onSaveSafeWord}
        />
      </Card>

      <CompanionAccessCard access={access} />

      <Card title="Info">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 tabular-nums">
          <dt>Commit</dt>
          <dd className="font-mono">
            {gitSha === 'dev' ? (
              <span className="text-foreground">dev</span>
            ) : (
              <a
                href={`https://github.com/autogoon/autogoon/commit/${gitSha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                {shortSha}
              </a>
            )}
          </dd>
          <dt>Branch</dt>
          <dd className="text-foreground font-mono">{gitRef}</dd>
          <dt>Built</dt>
          <dd className="text-foreground">{builtAt ?? '…'}</dd>
        </dl>
      </Card>
    </Panel>
  );
}
