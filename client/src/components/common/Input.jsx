import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { useFieldContext } from './Field.jsx';

/**
 * 36px tall, 6px radius, 12px horizontal padding, 13px value — from the source.
 *
 * A field is found by its SURFACE, not its outline. Once the theme's rules were
 * turned right down, an input drawn on the same ground as the card around it had
 * no visible edge at all — you could not see where to click. So the well is a
 * step lighter than the panel it sits in, and the border only refines that edge.
 *
 * The focus ring itself is the global `:focus-visible` teal outline declared in
 * styles/index.css, so every control agrees on one.
 */
export const inputSurface =
  'w-full border border-hairline bg-surface-elevated text-sm text-ink placeholder:text-ink-subtle ' +
  'transition-colors duration-100 focus:border-hairline-strong ' +
  'disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:text-ink-subtle ' +
  'aria-[invalid=true]:border-danger';

export const Input = forwardRef(function Input({ className, id, ...props }, ref) {
  const field = useFieldContext();

  return (
    <input
      ref={ref}
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      className={cn(inputSurface, 'h-control-lg rounded-sm px-3', className)}
      {...props}
    />
  );
});

export default Input;
