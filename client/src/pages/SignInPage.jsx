import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button, Callout, Field, Input } from '../components/common/index.js';
import { useAuthStore } from '../store/authStore.js';
import { useAuthSubmit } from '../features/auth/useAuthSubmit.js';
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton.jsx';
import { CodeSignIn } from '../features/auth/CodeSignIn.jsx';
import { VerifyCodeStep } from '../features/auth/VerifyCodeStep.jsx';
import { ApiClientError } from '../api/client.js';

/** Google redirects back with `?error=...` when the OAuth round-trip fails. */
const GOOGLE_ERRORS = {
  google_denied: 'Google sign-in was cancelled.',
  google_failed: "Google sign-in didn't work. Please try again.",
  google_unavailable: 'Google sign-in is not available right now.',
};

export function SignInPage() {
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();
  const location = useLocation();
  // Password is the default because it is what returning users expect. The code
  // route exists for accounts that never had a password — anyone who arrived
  // through another app — and as an escape hatch for a forgotten one.
  const [useCode, setUseCode] = useState(false);
  // Set when a correct password meets an address that was never verified. The
  // server has already emailed a code by then, so the screen moves straight to
  // typing it rather than reporting a failure the reader cannot act on.
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);

  // Return the user to whatever they were trying to reach.
  const destination = location.state?.from?.pathname ?? '/';
  const googleError = GOOGLE_ERRORS[new URLSearchParams(location.search).get('error')] ?? null;

  const handler = useCallback(
    async (values) => {
      try {
        const session = await signIn(values);
        navigate(destination, { replace: true });
        return session;
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmail(values.email);
          return null;
        }
        throw err;
      }
    },
    [signIn, navigate, destination],
  );

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(handler);

  const onSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({ email: data.get('email'), password: data.get('password') });
  };

  const goHome = () => navigate(destination, { replace: true });

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
      {googleError && (
        <Callout tone="danger" className="mb-4">
          {googleError}
        </Callout>
      )}

      {unverifiedEmail ? (
        <VerifyCodeStep
          email={unverifiedEmail}
          note={
            <>
              Your email address has not been confirmed yet. We sent a 6-digit code to{' '}
              <span className="font-semibold">{unverifiedEmail}</span> — enter it to finish signing
              in.
            </>
          }
          onVerified={goHome}
          onBack={() => setUnverifiedEmail(null)}
          backLabel="Back to sign in"
        />
      ) : useCode ? (
        <CodeSignIn onSignedIn={goHome} />
      ) : (
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
      )}

      {!unverifiedEmail && (
        <button
          type="button"
          className="mt-4 w-full text-sm text-ink-muted hover:text-ink"
          onClick={() => setUseCode((current) => !current)}
        >
          {useCode ? 'Sign in with a password instead' : 'Email me a sign-in code instead'}
        </button>
      )}

      <GoogleSignInButton text="Continue with Google" />
    </AuthLayout>
  );
}

export default SignInPage;
