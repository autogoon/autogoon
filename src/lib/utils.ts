// The class-name joiner shadcn's components expect: conditional lists flattened
// by clsx, then conflicting Tailwind utilities resolved last-wins by
// tailwind-merge — the same resolution Button and Card already do directly.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
