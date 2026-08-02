// The pack's intro, at the top of the transcript above the first turn: the
// situation the thread opens on, addressed to the person playing. It scrolls
// with the transcript rather than pinning, and it never reaches the model.
// Carries the companion bubble's radius (chat-bubble.tsx) so it reads as part of
// the conversation, but runs the full width over a fainter fill and in dimmer
// text: nobody said it, and it has no side and no timestamp.

export function ThreadIntro({ text }: { text: string }) {
  return (
    <div className="bg-foreground/5 text-foreground/70 border-foreground/15 rounded-2xl border px-3 py-2 whitespace-pre-wrap">
      {text.trim()}
    </div>
  );
}
