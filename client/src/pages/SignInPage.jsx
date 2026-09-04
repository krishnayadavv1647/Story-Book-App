import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button, Callout, Field, Input } from '../components/common/index.js';
import { useAuthStore } from '../store/authStore.js';
import { useAuthSubmit } from '../features/auth/useAuthSubmit.js';

export function SignInPage() {
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();
  const location = useLocation();

  // Return the user to whatever they were trying to reach.
  const destination = location.state?.from?.pathname ?? '/';

  const handler = useCallback(
    async (values) => {
      const session = await signIn(values);
      navigate(destination, { replace: true });
      return session;
    },
    [signIn, navigate, destination],
  );

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(handler);

  const onSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({ email: data.get('email'), password: data.get('password') });
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep building your storybooks."
      footer={
        <>
          New to StoryBook Studio?{' '}
          <Link to="/sign-up" className="font-semibold text-ink hover:underline">
            Create an account
          </Link>
        </>
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

        <Field label="Password" error={fieldErrors.password}>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            required
          />
        </Field>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-ink-muted hover:text-ink">
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export default SignInPage;
