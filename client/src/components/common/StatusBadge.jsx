import { cn } from '../../lib/cn.js';

/**
 * Status pill. `neutral` is the measured "Needs Design" badge from the Story
 * Plan frame: dark surface, hairline border, 30px tall, 6px radius, 11px label.
 *
 * `accent` is the selected/highlighted tone. It is teal, not gold: gold marks
 * the one main action on a screen, and a badge is not an action.
 *
 * The dot variants come from the Canva Character screen ("● Ready",
 * "● Needs Design"). The coloured tones are system extensions — no approved
 * screen defines a red or amber badge fill.
 */
const TONES = {
  neutral: { chip: 'border-hairline bg-surface text-ink', dot: 'bg-ink-muted' },
  accent: { chip: 'border-hairline-strong bg-teal-soft text-ink', dot: 'bg-teal-bright' },
  success: { chip: 'border-hairline bg-surface text-ink', dot: 'bg-success' },
  warning: { chip: 'border-hairline bg-surface text-ink', dot: 'bg-warning' },
  danger: { chip: 'border-hairline bg-surface text-danger', dot: 'bg-danger' },
};

export function StatusBadge({ children, tone = 'neutral', dot = false, className, ...props }) {
  const style = TONES[tone] ?? TONES.neutral;

  return (
    <span
      className={cn(
        'inline-flex h-control-sm items-center gap-1.5 rounded-sm border px-3.5 text-2xs',
        style.chip,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-pill', style.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export default StatusBadge;
