// The voice session's live stage (voiceStage), rendered two ways: a chunky
// badge pinned to the top-left of the lightbox, and a chat-style bubble in the
// conversation transcript — the "other person is typing" slot, the companion's
// stages on their side and Listening on yours, wearing ChatBubble's colours. Both share
// one icon + word per stage and a text shimmer (globals.css), and render
// nothing when idle.

import {
  AudioLines,
  Brain,
  MessageSquareText,
  Mic,
  Volume2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { VoiceStage } from '@/lib/voice/session-policy';

const STAGES: Record<
  Exclude<VoiceStage, 'idle'>,
  { icon: LucideIcon; word: string }
> = {
  listening: { icon: Mic, word: 'Listening' },
  thinking: { icon: Brain, word: 'Thinking' },
  streaming: { icon: MessageSquareText, word: 'Replying' },
  tts: { icon: AudioLines, word: 'Loading voice' },
  speaking: { icon: Volume2, word: 'Speaking' },
};

export function VoiceStageBadge({ stage }: { stage: VoiceStage }) {
  if (stage === 'idle') return null;
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
      <span className="text-shimmer text-base font-medium">{word}</span>
    </div>
  );
}

export function VoiceStageBubble({ stage }: { stage: VoiceStage }) {
  // Once the companion's reply exists, it is the status: the transcript rings that bubble
  // instead (ChatBubble's `voice`), so a row here would say the same thing
  // twice. Everything earlier — listening, thinking, replying — has no message
  // on screen yet and still needs one. The lightbox badge keeps all stages: an
  // open picture covers the transcript.
  if (stage === 'idle' || stage === 'tts' || stage === 'speaking') return null;
  const { icon: Icon, word } = STAGES[stage];
  // Listening is the user's own speech streaming in, so it sits on the user's
  // side of the chat; every other stage is the companion's.
  const isUser = stage === 'listening';
  return (
    <div
      role="status"
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div
        className={`flex max-w-[80%] items-center gap-2 rounded-2xl px-3 py-2 ${
          isUser ? 'bg-blue-600 text-white' : 'bg-foreground/10 text-foreground'
        }`}
      >
        <Icon className="size-5 animate-pulse" />
        <span
          className={`text-shimmer ${
            isUser ? '' : '[--shimmer-color:var(--foreground)]'
          }`}
        >
          {word}
        </span>
      </div>
    </div>
  );
}
