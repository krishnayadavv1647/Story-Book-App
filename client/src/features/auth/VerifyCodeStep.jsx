import { useCallback, useState } from 'react';

import { Button, Callout, Field, Input } from '../../components/common/index.js';
import { useAuthStore } from '../../store/authStore.js';
import { useAuthSubmit } from './useAuthSubmit.js';

/**
 * "Type the code we emailed you."
 *
 * The last step of three different journeys — signing up, signing in to an
 * address that was never verified, and signing in with a code instead of a
 * password — so it lives on its own rather than being written out three times
 * and drifting apart.
 *
 * `note` is what brought the reader here, which is not the same sentence each
 * time: a new account is being confirmed, an old one is being proved, or a
 * password is simply not being used today.
 */
export function VerifyCodeStep({ email, note, onVerified, onBack, backLabel = 'Start again' }) {
  const signInWithCode = useAuthStore((state) => state.signInWithCode);
  const [code, setCode] = useState('');

  const finish = useCallback(
    async (values) => {
      const session = await signInWithCode(values);
      onVerified?.(session);
      return session;
    },
    [signInWithCode, onVerified],
  );

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(finish);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit({ email, code });
      }}
    >
      <Callout>
        {note ?? (
          <>
            If <span className="font-semibold">{email}</span> can receive mail, a 6-digit code is on
            its way.
          </>
        )}
      </Callout>

      {formError && <Callout tone="danger">{formError}</Callout>}

      <Field label="Your code" error={fieldErrors.code} hint="It expires shortly.">
        <Input
          name="code"
          // `one-time-code` is what lets a phone offer the code straight from
          // the notification instead of making anyone retype it.
          autoComplete="one-time-code"
          inputMode="numeric"
          placeholder="123456"
          className="text-center text-lg tracking-[0.4em]"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          autoFocus
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        Continue
      </Button>

      {onBack && (
        <button
          type="button"
          className="w-full text-sm text-ink-muted hover:text-ink"
          onClick={onBack}
        >
          {backLabel}
        </button>
      )}
    </form>
  );
}

export default VerifyCodeStep;
