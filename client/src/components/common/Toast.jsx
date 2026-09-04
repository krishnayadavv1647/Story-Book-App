import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { X, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const ToastContext = createContext(null);

const TONES = {
  info: { Icon: Info, accent: 'text-ink' },
  success: { Icon: CheckCircle2, accent: 'text-success' },
  warning: { Icon: AlertTriangle, accent: 'text-warning' },
  danger: { Icon: XCircle, accent: 'text-danger' },
};

let nextId = 0;

/**
 * Transient feedback — "All changes saved", "Page regenerated", a failed export.
 *
 * Radix Toast handles the live region, the swipe/dismiss behaviour and, notably,
 * pausing the timer while the window is unfocused, so a message cannot expire
 * unseen while the user is in another tab.
 */
export function ToastProvider({ children, duration = 5000 }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options) => {
    const id = ++nextId;
    setToasts((current) => [
      ...current,
      typeof options === 'string' ? { id, title: options, tone: 'info' } : { id, tone: 'info', ...options },
    ]);
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider duration={duration} swipeDirection="right">
        {children}

        {toasts.map(({ id, title, description, tone }) => {
          const { Icon, accent } = TONES[tone] ?? TONES.info;
          return (
            <RadixToast.Root
              key={id}
              onOpenChange={(open) => !open && dismiss(id)}
              className={cn(
                'flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-3',
                'animate-slide-in rounded-lg border border-hairline bg-surface-overlay p-4 shadow-overlay',
                'data-[swipe=end]:animate-fade-in',
              )}
            >
              <Icon className={cn('mt-px h-4 w-4 shrink-0', accent)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <RadixToast.Title className="text-sm font-semibold text-ink">
                  {title}
                </RadixToast.Title>
                {description && (
                  <RadixToast.Description className="mt-1 text-xs text-ink-muted">
                    {description}
                  </RadixToast.Description>
                )}
              </div>
              <RadixToast.Close
                aria-label="Dismiss notification"
                className="shrink-0 rounded-sm p-1 text-ink-muted hover:bg-surface-hover hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}

        <RadixToast.Viewport className="fixed bottom-0 right-0 z-50 flex max-h-screen w-auto flex-col gap-2 p-6 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return context;
}

export default ToastProvider;
