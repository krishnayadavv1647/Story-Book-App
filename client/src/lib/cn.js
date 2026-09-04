import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, letting a caller's utility win over a component's default
 * for the same CSS property instead of the two fighting on specificity.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default cn;
