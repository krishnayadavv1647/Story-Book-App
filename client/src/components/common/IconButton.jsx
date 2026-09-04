import { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Square icon-only control. The design draws two sizes:
 *   md — 34×34, radius 7 (expanded page-row actions, sidebar collapse)
 *   sm — 34×30, radius 6 (collapsed page-row actions)
 *
 * `label` is required: an icon-only control with no accessible name is invisible
 * to a screen reader, and every one of these is a real action.
 *
 * `tone="primary"` is the same gold as `Button variant="primary"`, for a screen
 * whose one main action happens to be icon-only (the Story Agent's send arrow).
 * It exists here rather than as overrides at the call site because this
 * component's ground, border and ink are utilities, and a utility always beats
 * the shared `.surface-gold` component class — so overriding it from outside
 * takes four extra classes and breaks the moment this file changes.
 */
const SIZES = {
  sm: 'h-control-sm w-control-md rounded-sm',
  md: 'h-control-md w-control-md rounded',
};

const TONES = {
  default: 'border-hairline bg-surface text-ink hover:bg-surface-hover active:bg-surface-elevated',
  // Red at rest, not only on hover: a delete control should read as dangerous
  // before the pointer reaches it.
  danger:
    'border-hairline bg-surface text-danger hover:border-danger hover:bg-danger-soft',
  primary: 'surface-gold',
};

export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, size = 'md', type = 'button', className, tone = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border',
        'transition-[background,border-color,box-shadow,transform,color] duration-100',
        'disabled:cursor-not-allowed disabled:opacity-50',
        TONES[tone] ?? TONES.default,
        SIZES[size],
        className,
      )}
      {...props}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
    </button>
  );
});

export default IconButton;
