import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Shared shadcn class names use only explicitly declared dependencies. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
