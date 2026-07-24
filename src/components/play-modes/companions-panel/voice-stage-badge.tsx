"use client";

// The lightbox's live status badge: what the voice session is doing right now
// (voiceStage), shown as a chunky icon + word pinned to the top-left of the
// picture. Hidden when idle — it only appears while something is happening.

import {
  AudioLines,
  Brain,
  MessageSquareText,
  Mic,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { VoiceStage } from "@/lib/voice/session-policy";

const STAGES: Record<
  Exclude<VoiceStage, "idle">,
  { icon: LucideIcon; word: string }
> = {
  listening: { icon: Mic, word: "Listening" },
  thinking: { icon: Brain, word: "Thinking" },
  streaming: { icon: MessageSquareText, word: "Replying" },
  tts: { icon: AudioLines, word: "Loading voice" },
  speaking: { icon: Volume2, word: "Speaking" },
};

export function VoiceStageBadge({ stage }: { stage: VoiceStage }) {
  if (stage === "idle") return null;
  const { icon: Icon, word } = STAGES[stage];
  return (
    // stopPropagation: a status readout, not a close target (the backdrop
    // behind it closes the lightbox).
    <div
      role="status"
      onClick={(e) => e.stopPropagation()}
      className="absolute top-4 left-4 z-10 flex items-center gap-2.5 rounded-full bg-white/10 py-3 pr-5 pl-4 text-white"
    >
      <Icon className="size-8 animate-pulse" />
      <span className="text-base font-medium">{word}</span>
    </div>
  );
}
