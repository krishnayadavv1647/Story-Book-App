import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/**
 * The 72px bar that closes every step screen: autosave status on the left, an
 * optional step counter centred, primary and secondary actions on the right.
 *
 * `sticky` keeps it in view on a short viewport. The sources draw it in flow at
 * the foot of a 1080px frame, where the two are indistinguishable.
 */
export function StickyActionBar({ status, statusTone = 'saved', step, actions, className, sticky = true }) {
  return (
    <div
      className={cn(
        'flex h-[72px] items-center rounded-lg border border-hairline bg-surface px-[22px]',
        sticky && 'sticky bottom-0 z-10',
        className,
      )}
    >
      {status && (
        <p
          // Autosave state changes without user action, so it is announced politely.
          role="status"
          aria-live="polite"
          className={cn(
            'flex items-center gap-2.5 text-sm',
            statusTone === 'saved' ? 'text-ink' : 'text-ink-muted',
          )}
        >
          {statusTone === 'saved' && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {status}
        </p>
      )}

      {step && (
        <p className="mx-auto text-sm text-ink-muted">{step}</p>
      )}

      {actions && <div className={cn('flex items-center gap-4', !step && 'ml-auto')}>{actions}</div>}
    </div>
  );
}

export default StickyActionBar;
