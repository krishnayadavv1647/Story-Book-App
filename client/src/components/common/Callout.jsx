import { Info, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * The banner from the Generation Estimate card: 6px radius, 12px text, 18px
 * inset. The informational tone is teal, which is what teal is for; the status
 * tones keep their own semantic colour so a warning never reads as a hint.
 *
 * Every tone carries an icon as well as a colour, so the meaning survives for a
 * reader who cannot separate the hues.
 */
const TONES = {
  info: { box: 'border-hairline-strong bg-teal-soft text-ink', Icon: Info },
  success: { box: 'border-success bg-success-soft text-ink', Icon: CheckCircle2 },
  warning: { box: 'border-warning bg-warning-soft text-ink', Icon: AlertTriangle },
  danger: { box: 'border-danger bg-danger-soft text-ink', Icon: XCircle },
};

export function Callout({ tone = 'info', children, className, ...props }) {
  const { box, Icon } = TONES[tone] ?? TONES.info;

  return (
    <div
      // Only failures interrupt; the rest are read in document order.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex min-h-[46px] items-center gap-3 rounded-sm border px-4 py-2.5 text-xs',
        box,
        className,
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default Callout;
