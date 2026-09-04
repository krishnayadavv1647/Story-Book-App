import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button, Callout, Field, Input } from '../components/common/index.js';
import { resetPassword } from '../api/auth.js';
import { useAuthSubmit } from '../features/auth/useAuthSubmit.js';
import { useToast } from '../components/common/Toast.jsx';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mismatch, setMismatch] = useState(null);

  const handler = useCallback(
    async (values) => {
      const result = await resetPassword(values);
      toast({ title: 'Password updated', description: 'Sign in with your new password.' });
      navigate('/sign-in', { replace: true });
      return result;
    },
    [navigate, toast],
  );

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(handler);

  const onSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = data.get('password');

    // Confirmation is a client-side concern — the server only ever sees one.
    if (password !== data.get('confirmPassword')) {
      setMismatch('Both passwords must match');
      return;
    }

    setMismatch(null);
    submit({ token, password });
  };

  if (!token) {
    return (
      <AuthLayout
        title="This link is incomplete"
        subtitle="The reset link is missing its token."
        footer={
          <Link to="/forgot-password" className="font-semibold text-ink hover:underline">
            Request a new link
          </Link>
        }
      >
        <Callout tone="danger">
          Open the link straight from your email, or request a fresh one.
        </Callout>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="You'll be signed out everywhere else once it's changed."
      footer={
        <Link to="/sign-in" className="font-semibold text-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Callout tone="danger">{formError}</Callout>}

        <Field label="New password" hint="At least 12 characters." error={fieldErrors.password}>
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
          />
        </Field>

        <Field label="Confirm new password" error={mismatch}>
          <Input name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}

export default ResetPasswordPage;
