import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';
import { useFieldContext } from './Field.jsx';
import { inputSurface } from './Input.jsx';

/**
 * 68px tall in the source (the Narration and Scene Description fields), 6px
 * radius, 12px padding. `rows` lets a caller grow it without leaving the scale.
 */
export const Textarea = forwardRef(function Textarea({ className, id, rows = 3, ...props }, ref) {
  const field = useFieldContext();

  return (
    <textarea
      ref={ref}
      id={id ?? field?.id}
      rows={rows}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      className={cn(inputSurface, 'min-h-[68px] rounded-sm p-3 leading-normal', className)}
      {...props}
    />
  );
});

export default Textarea;
