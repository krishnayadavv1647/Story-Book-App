import { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';

import { AppShell, PageHeader } from '../components/layout/index.js';
import {
  Button,
  Callout,
  Card,
  Field,
  Input,
  Select,
  Switch,
} from '../components/common/index.js';
import { useProfile } from '../features/account/useAccount.js';

/**
 * SYSTEM-DERIVED. No frame covers account settings.
 *
 * Changing the password asks for the current one even though the session
 * already proves who this is — a borrowed unlocked browser should not be enough
 * to lock the owner out. The server signs every other session out afterwards.
 */
export function SettingsPage() {
  const account = useProfile();
  const [name, setName] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  useEffect(() => {
    if (account.profile?.name) setName(account.profile.name);
  }, [account.profile?.name]);

  if (account.isPending) {
    return (
      <AppShell>
        <p role="status" className="p-10 text-sm text-ink-muted">
          Loading your account…
        </p>
      </AppShell>
    );
  }

  if (account.isError) {
    return (
      <AppShell>
        <Callout tone="danger" className="mt-6">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load your account.</span>
            <Button size="sm" onClick={account.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </AppShell>
    );
  }

  const preferences = account.profile?.preferences ?? {};

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Your account, and how the app behaves." />

      {account.error && (
        <Callout tone="danger" className="mt-5">
          {account.error}
        </Callout>
      )}
      {account.saved && !account.error && (
        <Callout tone="success" className="mt-5">
          <span className="flex w-full items-center justify-between gap-4">
            <span>{account.saved}</span>
            <Button size="sm" onClick={account.dismiss}>
              Dismiss
            </Button>
          </span>
        </Callout>
      )}

      <div className="mt-6 grid max-w-[900px] gap-5 pb-6">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Profile</h2>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Email" hint="Changing your email is not available yet.">
              <Input value={account.profile?.email ?? ''} disabled />
            </Field>
          </div>

          <div className="mt-4">
            <Button
              variant="primary"
              leadingIcon={Save}
              loading={account.save.isPending}
              disabled={!name.trim() || name === account.profile?.name}
              onClick={() => account.save.mutate({ name: name.trim() })}
            >
              Save changes
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Preferences</h2>

          <div className="mt-4 grid grid-cols-2 items-end gap-4">
            <Field label="Theme" hint="The app renders in the dark theme only; this choice is saved but not applied yet.">
              <Select
                value={preferences.theme ?? 'dark'}
                onChange={(event) =>
                  account.save.mutate({ preferences: { theme: event.target.value } })
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">Match my system</option>
              </Select>
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-sm border border-hairline p-3">
              <span>
                <span className="block text-xs font-semibold text-ink">Email notifications</span>
                <span className="block text-xs text-ink-muted">
                  No mail provider is connected yet, so nothing is sent.
                </span>
              </span>
              <Switch
                label="Email notifications"
                checked={preferences.emailNotifications !== false}
                onCheckedChange={(checked) =>
                  account.save.mutate({ preferences: { emailNotifications: checked } })
                }
              />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Password</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Changing your password signs out every other browser you are signed in on.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Current password">
              <Input
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" hint="At least 12 characters.">
              <Input
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Button
              leadingIcon={KeyRound}
              loading={account.password.isPending}
              disabled={!current || next.length < 12}
              onClick={() =>
                account.password.mutate(
                  { currentPassword: current, newPassword: next },
                  {
                    onSuccess: () => {
                      setCurrent('');
                      setNext('');
                    },
                  },
                )
              }
            >
              Change password
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export default SettingsPage;
