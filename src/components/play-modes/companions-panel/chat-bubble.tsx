'use client';

// One transcript row: user turns right-aligned in the accent colour, hers
// left-aligned and muted. `pending` dims the in-progress reply until it folds
// into the thread. `at` (absent on pending bubbles and pre-timestamp turns)
// puts a small clock time under the bubble, on its aligned side.

export function ChatBubble({
  role,
  text,
  at,
  pending = false,
}: {
  role: 'user' | 'assistant';
  text: string;
  at?: number;
  pending?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap ${
          isUser ? 'bg-blue-600 text-white' : 'bg-foreground/10 text-foreground'
        } ${pending ? 'opacity-70' : ''}`}
      >
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
