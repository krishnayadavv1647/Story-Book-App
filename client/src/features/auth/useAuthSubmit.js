import { useCallback, useState } from 'react';
import { ApiClientError } from '../../api/client.js';

/**
 * Submit state for the auth forms.
 *
 * Server-side validation is the authority, so a 422 is mapped back onto the
 * fields that caused it rather than shown as one opaque banner. Anything else
 * becomes a single form-level message.
 */
export function useAuthSubmit(handler) {
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const submit = useCallback(
    async (values) => {
      setPending(true);
      setFormError(null);
      setFieldErrors({});

      try {
        return await handler(values);
      } catch (err) {
        if (err instanceof ApiClientError && err.isValidationError) {
          setFieldErrors(err.fieldErrors);
          setFormError(null);
        } else {
          setFormError(
            err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.',
          );
        }
        return null;
      } finally {
        setPending(false);
      }
    },
    [handler],
  );

  return { pending, formError, fieldErrors, submit, setFormError };
}

export default useAuthSubmit;
