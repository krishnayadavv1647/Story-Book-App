import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { IconButton } from './IconButton.jsx';

const WIDTHS = {
  sm: 'w-[420px]',
  md: 'w-[560px]',
  lg: 'w-[760px]',
  xl: 'w-[980px]',
};

/**
 * Built on Radix Dialog, which supplies the focus trap, focus restore, Escape
 * handling, scroll lock and `aria-modal` wiring. Reimplementing those by hand is
 * where accessible modals usually go wrong.
 *
 * A description is always rendered — visually hidden when the caller has none —
 * because Radix warns when `aria-describedby` points at nothing.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-scrim" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[85vh] -translate-x-1/2 -translate-y-1/2',
            'animate-scale-in overflow-y-auto rounded-lg border border-hairline bg-surface-overlay shadow-overlay',
            'max-w-[calc(100vw-32px)]',
            WIDTHS[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-hairline p-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              <Dialog.Description
                className={cn('mt-1 text-xs text-ink-muted', !description && 'sr-only')}
              >
                {description ?? title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton icon={X} label="Close dialog" />
            </Dialog.Close>
          </div>

          <div className="p-4">{children}</div>

          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default Modal;
