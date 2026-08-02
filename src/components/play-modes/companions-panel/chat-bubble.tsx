// One transcript row: user turns right-aligned in the accent colour, the
// companion's left-aligned and muted. `pending` dims the in-progress reply until
// it folds into the thread. `at` (absent on pending bubbles and pre-timestamp
// turns) puts a small clock time under the bubble, on its aligned side. `voice`
// rings the bubble with a slow shimmer once the companion's words are on their
// way to being spoken: faint and slow while the voice loads, brighter and
// quicker once they're actually saying them. The message itself is the
// indicator, so neither stage gets a status row of its own.

const VOICE = {
  warming: {
    word: 'Loading voice',
    className: '[--shimmer-duration:4.4s] [--shimmer-strength:0.5]',
  },
  speaking: { word: 'Speaking', className: '' },
};

export function ChatBubble({
  role,
  text,
  at,
  pending = false,
  voice,
}: {
  role: 'user' | 'assistant';
  text: string;
  at?: number;
  pending?: boolean;
  voice?: 'warming' | 'speaking';
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
          isUser ? 'bg-blue-600 text-white' : 'bg-foreground/10 text-foreground'
        } ${pending ? 'opacity-70' : ''} ${
          voice === undefined
            ? ''
            : `border-shimmer [--shimmer-color:var(--foreground)] ${VOICE[voice].className}`
        }`}
      >
        {/* The shimmer is purely visual, so the stage needs saying out loud
            too: this is the only announcement a screen reader gets of it. */}
        {voice !== undefined && (
          <span role="status" className="sr-only">
            {VOICE[voice].word}
          </span>
        )}
        {/* Trim leading/trailing whitespace (M3 often opens with a blank line)
            while keeping internal paragraph breaks under whitespace-pre-wrap. */}
        {text.trim()}
      </div>
      {at !== undefined && (
        <span className="text-muted-foreground mt-0.5 px-1 text-[10px]">
          {new Date(at).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      )}
    </div>
  );
}
