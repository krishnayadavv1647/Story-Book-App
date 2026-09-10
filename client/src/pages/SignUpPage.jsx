import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';

import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button, Callout, Field, Input } from '../components/common/index.js';
import { useAuthStore } from '../store/authStore.js';
import { useAuthSubmit } from '../features/auth/useAuthSubmit.js';
import { GoogleSignInButton } from '../features/auth/GoogleSignInButton.jsx';
import { VerifyCodeStep } from '../features/auth/VerifyCodeStep.jsx';
import { lookupBonusLink } from '../api/auth.js';

/**
 * Signing up is two steps now: the form creates the account, and the emailed
 * code proves the address before anybody is let in. The second step is the same
 * component the sign-in screen uses, so there is one place a code is typed.
 */
export function SignUpPage() {
  const signUp = useAuthStore((s) => s.signUp);
  const navigate = useNavigate();
  const [pendingEmail, setPendingEmail] = useState(null);

  // Arriving through a bonus link (`/join/:code`). The page asks the server what
  // the link offers before anyone types, so a dead link is said to be dead
  // rather than discovered after signing up.
  const { code: bonusCode } = useParams();
  const bonus = useQuery({
    queryKey: ['bonus-link', bonusCode],
    queryFn: () => lookupBonusLink(bonusCode),
    enabled: Boolean(bonusCode),
    retry: false,
  });
  const offer = bonus.data?.valid ? bonus.data : null;

  const handler = useCallback(
    async (values) => {
      await signUp(values);
      setPendingEmail(values.email);
      return true;
    },
    [signUp],
  );

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(handler);

  const onSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({
      name: data.get('name'),
      email: data.get('email'),
      password: data.get('password'),
      // Sent even if the lookup said the link is dead: the server decides, and
      // an unusable code simply makes this an ordinary sign-up.
      ...(bonusCode ? { bonusCode } : {}),
    });
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Describe a story and it will be written and illustrated for you."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/sign-in" className="font-semibold text-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!pendingEmail && offer && (
        <Callout tone="success" className="mb-4">
          <span className="flex items-start gap-2">
            <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              You are claiming the <span className="font-semibold">{offer.planName}</span> —{' '}
              {offer.credits} credits, added as soon as you confirm your email.
            </span>
          </span>
        </Callout>
      )}
      {!pendingEmail && bonusCode && bonus.data && !offer && (
        <Callout className="mb-4">
          This bonus link is no longer active. You can still create an account.
        </Callout>
      )}

      {pendingEmail ? (
        <VerifyCodeStep
          email={pendingEmail}
          note={
            <>
              Almost there. We sent a 6-digit code to{' '}
              <span className="font-semibold">{pendingEmail}</span> — enter it to finish creating
              your account.
            </>
          }
          onVerified={() => navigate('/', { replace: true })}
          onBack={() => setPendingEmail(null)}
          backLabel="Use a different email"
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Callout tone="danger">{formError}</Callout>}

          <Field label="Name" error={fieldErrors.name}>
            <Input name="name" autoComplete="name" placeholder="Krishna Yadav" required autoFocus />
          </Field>

          <Field label="Email" error={fieldErrors.email}>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </Field>

          {/* The hint states the rule up front rather than waiting for a rejection. */}
          <Field label="Password" hint="At least 12 characters." error={fieldErrors.password}>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Something long and memorable"
              required
            />
          </Field>

          <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
            Create account
          </Button>
        </form>
      )}

      <GoogleSignInButton bonusCode={offer ? bonusCode : null} text="Sign up with Google" />
    </AuthLayout>
  );
}

export default SignUpPage;
