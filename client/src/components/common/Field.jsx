import { createContext, useContext, useId } from 'react';
import { cn } from '../../lib/cn.js';

const FieldContext = createContext(null);

/** Lets a control wire itself to its label, hint and error without prop drilling. */
export function useFieldContext() {
  return useContext(FieldContext);
}

/**
 * Label + control + hint/error, matching the Book Information form: a 12px
 * semibold label sitting 22px above a 36px control.
 *
 * The id, `aria-describedby` and `aria-invalid` wiring happens here so no
 * individual form can forget it.
 */
export function Field({ label, hint, error, required = false, className, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn('flex flex-col', className)}>
        {label && (
          <label htmlFor={id} className="mb-1.5 text-xs font-semibold text-ink">
            {label}
            {required && (
              <span className="ml-0.5 text-danger" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        {children}

        {error ? (
          // `role="alert"` so a validation failure is announced when it appears.
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
            {error}
          </p>
        ) : (
          hint && (
            <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
              {hint}
            </p>
          )
        )}
      </div>
    </FieldContext.Provider>
  );
}

export default Field;
