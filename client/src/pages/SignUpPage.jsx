import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Button, Callout, Field, Input } from '../components/common/index.js';
import { useAuthStore } from '../store/authStore.js';
import { useAuthSubmit } from '../features/auth/useAuthSubmit.js';

export function SignUpPage() {
  const signUp = useAuthStore((s) => s.signUp);
  const navigate = useNavigate();

  const handler = useCallback(
    async (values) => {
      const session = await signUp(values);
      navigate('/', { replace: true });
      return session;
    },
    [signUp, navigate],
  );

  const { pending, formError, fieldErrors, submit } = useAuthSubmit(handler);

  const onSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({
      name: data.get('name'),
      email: data.get('email'),
      password: data.get('password'),
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
    </AuthLayout>
  );
}

export default SignUpPage;
