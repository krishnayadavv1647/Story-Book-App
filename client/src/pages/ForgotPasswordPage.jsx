import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button, Callout, Field, Input } from '../components/common/index.js';
import { forgotPassword } from '../api/auth.js';
import { useAuthSubmit } from '../features/auth/useAuthSubmit.js';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState(null);

  const handler = useCallback(async (values) => {
    const result = await forgotPassword(values);
    setSent(true);
    // Mail delivery is not wired up yet; in development the server hands back
    // the token so the flow can be finished without an inbox.
    setDevToken(result?.devToken ?? null);
    return result;
  }, []);

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(handler);

  const onSubmit = (event) => {
    event.preventDefault();
    submit({ email: new FormData(event.currentTarget).get('email') });
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If that address has an account, a reset link is on its way."
        footer={
          <Link to="/sign-in" className="font-semibold text-ink hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Callout>The link expires in 30 minutes and can only be used once.</Callout>

        {devToken && (
          <div className="mt-4 rounded-sm border border-hairline bg-page p-3">
            <p className="text-xs font-semibold text-ink">Development only</p>
            <p className="mt-1 text-xs text-ink-muted">
              No mail provider is configured yet, so the link is shown here.
            </p>
            <Link
              to={`/reset-password?token=${devToken}`}
              className="mt-2 inline-block break-all text-sm font-semibold text-ink underline"
            >
              Continue to reset your password
            </Link>
          </div>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link to="/sign-in" className="font-semibold text-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Callout tone="danger">{formError}</Callout>}

        <Field label="Email" error={fieldErrors.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            autoFocus
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
