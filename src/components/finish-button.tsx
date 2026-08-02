// The Finish pre-ending — reach and hold the climax point. Amber, to set it apart
// from the CummingButton's red send-off. Pass a `className` for width/layout
// (defaults to full width).

import { Button } from '@/components/button';

export function FinishButton({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void;
  disabled: boolean;
  className?: string;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg bg-linear-to-br from-amber-500 to-orange-600 py-3 text-lg font-bold text-white disabled:opacity-50 ${
        className ?? 'w-full'
      }`}
      voiceCommand="finish"
    >
      Finish
    </Button>
  );
}
