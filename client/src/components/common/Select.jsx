import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { useFieldContext } from './Field.jsx';
import { inputSurface } from './Input.jsx';

/**
 * A native select styled to match the design's input: 36px tall, 6px radius,
 * chevron inset 16px from the right edge.
 *
 * Native is deliberate. It is keyboard- and screen-reader-correct for free, and
 * on touch it opens the platform picker. The Book Information form has six of
 * these; a custom listbox would be a regression there. Reach for a Radix Select
 * only where the option rows need rich content.
 */
export const Select = forwardRef(function Select(
  { className, id, children, placeholder, ...props },
  ref,
) {
  const field = useFieldContext();

  return (
    <div className="relative">
      <select
        ref={ref}
        id={id ?? field?.id}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        className={cn(
          inputSurface,
          'h-control-lg cursor-pointer appearance-none rounded-sm pl-3 pr-8',
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink"
        aria-hidden="true"
      />
    </div>
  );
});

export default Select;
