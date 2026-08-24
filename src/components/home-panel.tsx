// The home screen — the top of the navigation hierarchy: the device
// token/connection group first (it's the gate to everything else), then the
// play mode chooser (each entry doubles as that play mode's voice word,
// wearing its play mode's accent colour), and the getting-started small print.
// Settings sits beside home as a top-level tab (see page.tsx).

import { Plug, type LucideIcon } from 'lucide-react';
import type { VacuglideDeviceController } from '@/hooks/use-vacuglide-device';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Panel } from '@/components/panel';
import {
  CONTROL_BORDER,
  CONTROL_BUTTON_BASE,
  CONTROL_INPUT,
} from '@/components/controls';

export function HomePanel({
  vacuglide,
  playModes,
  onSelectAction,
}: {
  vacuglide: VacuglideDeviceController;
  playModes: ReadonlyArray<{
    id: string;
    label: string;
    description: string;
    // An optional second paragraph naming something new on this play mode.
    highlight?: string;
    icon: LucideIcon;
    iconClass: string;
    // The Card accent colour name (e.g. "fuchsia").
    accent: string;
  }>;
  // Named for the Action suffix Next's client-entry rule wants on a function
  // prop, not because it is a Server Action — this whole tree is client-side.
  onSelectAction: (id: string) => void;
}) {
  const chooser = (
    <Card title="Choose a play mode">
      {/* pt-1 is optical: a bordered box carries no line-height slack, so the
          title→border gap needs +4px to match the title→text gap elsewhere. */}
      <div className="flex flex-col gap-3 pt-1">
        {playModes.map((a) => (
          <Card
            key={a.id}
            button
            accent={a.accent}
            voiceCommand={a.id}
            onClick={() => onSelectAction(a.id)}
            icon={<a.icon className={a.iconClass} aria-hidden />}
            title={a.label}
          >
            <span className="block">{a.description}</span>
            {a.highlight !== undefined && (
              <span className="mt-1.5 block">{a.highlight}</span>
            )}
          </Card>
        ))}
      </div>
    </Card>
  );

  const device = (
    <Card title="Device">
      <p>
        Enter your Vacuglide device token, then use Connect in the header bar to
        connect via the Autoblow cloud API. The token is saved on this device,
        so next time Autogoon connects automatically.
      </p>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={vacuglide.token}
          onChange={(e) => vacuglide.setToken(e.target.value)}
          placeholder="Device token"
          spellCheck={false}
          autoComplete="off"
          className={`${CONTROL_INPUT} min-w-0 flex-1`}
        />
        <Button
          onClick={() => void vacuglide.connect()}
          disabled={vacuglide.connecting || vacuglide.connected}
          title={vacuglide.deviceStatus}
          className={`${CONTROL_BUTTON_BASE} flex shrink-0 items-center gap-1.5 ${
            // Exactly one border colour (see controls.ts): connected wins,
            // then error, then the default control border.
            vacuglide.connected
              ? 'border-emerald-500 text-emerald-500'
              : vacuglide.deviceStatusKind === 'error'
                ? 'border-destructive text-destructive'
                : CONTROL_BORDER
          }`}
        >
          <Plug className="size-4" />
          {vacuglide.connected
            ? 'Connected'
            : vacuglide.connecting
              ? 'Connecting…'
              : 'Connect'}
        </Button>
      </div>
      <p
        className={`text-sm ${
          vacuglide.deviceStatusKind === 'ok'
            ? 'text-emerald-500'
            : vacuglide.deviceStatusKind === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground'
        }`}
      >
        {vacuglide.deviceStatus}
      </p>
    </Card>
  );

  return (
    <Panel>
      {device}
      {chooser}

      <Card title="Getting started">
        <p>
          <span className="text-foreground font-medium">Autogoon</span> drives
          your Autoblow Vacuglide stroker by voice — hands-free, from this
          browser tab.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Enter your device token above and connect.</li>
          <li>
            Click <span className="text-foreground">Listen</span> in the header
            to start the mic (allow the microphone if your browser asks).
          </li>
          <li>Pick a play mode.</li>
        </ol>
        <p>
          You can use voice controls for most things — each page explains the
          words it recognises.
        </p>
        {process.env.NODE_ENV === 'development' ? (
          <p>
            <span className="text-foreground font-medium">Companion media</span>{' '}
            is bring-your-own — the{' '}
            <a
              href="https://github.com/autogoon/autogoon/blob/main/modes/COMPANIONS.md"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground underline underline-offset-4"
            >
              Companions doc
            </a>{' '}
            covers adding it.
          </p>
        ) : (
          <p>
            <span className="text-foreground font-medium">Companions</span> runs
            on your own OpenRouter and ElevenLabs keys — add them under Settings
            to reveal it.
          </p>
        )}
        <p>
          <span className="text-foreground font-medium">Privacy.</span> For the
          built-in play modes, speech recognition runs entirely on your machine
          — your audio never leaves it. Companions is the exception: it sends
          your speech and chat to ElevenLabs and OpenRouter (see the note on its
          own screen).
        </p>
        <p>
          <span className="text-foreground font-medium">On mobile,</span> keep
          this tab foregrounded and the screen awake — backgrounded or locked
          tabs stop the mic and the timing loop.
        </p>
      </Card>
    </Panel>
  );
}
