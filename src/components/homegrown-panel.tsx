"use client";

// Homegrown algorithm panel — presentation only. The algorithm runs in
// useHomegrown at the top of the tree so it keeps going while this panel is
// hidden behind another tab. Mostly boilerplate for now.

import type { HomegrownController } from "@/hooks/use-homegrown";
import type { VacuglideController } from "@/hooks/use-vacuglide";
import { Card } from "@/components/card";
import { LogCard } from "@/components/log-card";
import { RunButton } from "@/components/run-button";
import { VoiceCommands } from "@/components/voice-commands";
import { supportedWords } from "@/hooks/use-algorithm-runner";

export function HomegrownPanel({
  vacuglide,
  homegrown,
  onStart,
  onStop,
}: {
  vacuglide: VacuglideController;
  homegrown: HomegrownController;
  onStart: () => void;
  onStop: () => void;
}) {
  const words = supportedWords(homegrown.keywords);

  return (
    <section className="flex w-full flex-col gap-4">
      <RunButton
        running={homegrown.isPlaying}
        connected={vacuglide.connected}
        onStart={onStart}
        onStop={onStop}
        className="bg-gradient-to-br from-blue-600 to-cyan-500"
      />

      <VoiceCommands words={words} />

      <Card title="Homegrown">
        <p className="text-muted-foreground text-sm">
          A new algorithm, under construction. For now it just holds the speed
          at 10.
        </p>
      </Card>

      <LogCard title="Command log" entries={vacuglide.logEntries} />
    </section>
  );
}
