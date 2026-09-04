import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.jsx';

/**
 * Confirmation for a destructive or costly action — deleting a page, discarding
 * a plan.
 *
 * Radix AlertDialog rather than Dialog: it takes focus to the cancel action by
 * default and refuses to close on an outside click, so a stray click cannot
 * dismiss a decision the user has not made.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  destructive = false,
  loading = false,
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-scrim" />
        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2 animate-scale-in',
            'rounded-lg border border-hairline bg-surface-overlay p-4 shadow-overlay',
          )}
        >
          <AlertDialog.Title className="text-base font-semibold text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-ink-muted">
            {description}
          </AlertDialog.Description>

          <div className="mt-5 flex items-center justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default ConfirmDialog;
