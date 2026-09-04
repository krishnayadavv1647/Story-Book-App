import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * Character and location chips on a page-outline row: 26px tall, 6px radius,
 * dark chip fill, 11px muted label.
 *
 * `onRemove` renders a dismiss control. The source draws tags read-only, so any
 * removable tag is a system extension beyond the approved design.
 */
export function Tag({ children, onRemove, removeLabel, className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex h-control-xs items-center gap-1 rounded-sm bg-tag px-3.5',
        'text-2xs text-ink-muted',
        onRemove && 'pr-1.5',
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${children}`}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-pill hover:bg-surface-hover"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** Count beside a section heading: 24px tall, fully rounded, raised fill. */
export function CountPill({ children, className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-[32px] items-center justify-center rounded-pill bg-pill px-2',
        'text-2xs font-semibold text-ink-muted',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Tag;
