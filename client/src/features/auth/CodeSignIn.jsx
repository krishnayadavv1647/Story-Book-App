import { useCallback, useState } from 'react';

import { Button, Callout, Field, Input } from '../../components/common/index.js';
import { useAuthSubmit } from './useAuthSubmit.js';
import { VerifyCodeStep } from './VerifyCodeStep.jsx';
import * as authApi from '../../api/auth.js';

/**
 * Signing in with a code emailed to the address, no password involved.
 *
 * Two steps in one component because they are one thought: type your address,
 * type what arrives. An address nobody has used before gets an account, which
 * is what makes this the whole flow for a reader arriving from another app.
 *
 * The server's reply to step one is deliberately identical whether or not the
 * address is registered, so this screen cannot say "we sent you a code" any
 * more confidently than "check your inbox".
 */
export function CodeSignIn({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const ask = useCallback(async (values) => {
    await authApi.requestLoginCode(values);
    setSent(true);
    return true;
  }, []);

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(ask);

  if (sent) {
    return (
      <VerifyCodeStep
        email={email}
        onVerified={onSignedIn}
        onBack={() => setSent(false)}
        backLabel="Use a different address"
      />
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit({ email });
      }}
    >
      {formError && <Callout tone="danger">{formError}</Callout>}

      <Field
        label="Email"
        error={fieldErrors.email}
        hint="New here? Entering your address is all it takes."
      >
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        Email me a code
      </Button>
    </form>
  );
}

export default CodeSignIn;
