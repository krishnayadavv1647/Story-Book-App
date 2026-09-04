import { cn } from '../../lib/cn.js';

/**
 * A two-state toggle.
 *
 * `role="switch"` rather than a styled checkbox: the control reports its own
 * state to assistive technology, and the label stays the caller's business so
 * the same switch works inline in a settings row or beside a heading.
 */
export function Switch({ checked = false, onCheckedChange, disabled, label, className, id }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-bright',
        checked ? 'border-hairline-strong bg-teal' : 'border-hairline bg-surface-elevated',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 rounded-pill bg-ink shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

export default Switch;
