import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Activity, Coins, ShieldCheck } from 'lucide-react';

import { AppShell, PageHeader } from '../components/layout/index.js';
import {
  Button,
  Callout,
  Card,
  Input,
  SectionHeading,
  StatusBadge,
} from '../components/common/index.js';
import { useAdmin } from '../features/admin/useAdmin.js';
import { useAuthStore } from '../store/authStore.js';

/**
 * One account's balance, and the only way to change it.
 *
 * There is no billing provider, so a top-up is an operator action. The amount is
 * signed on the wire — the two buttons are just which sign to send — and the
 * server refuses to push an account below zero.
 */
function CreditControl({ user, adjust }) {
  const [amount, setAmount] = useState('');
  const value = Number.parseInt(amount, 10);
  const valid = Number.isInteger(value) && value > 0;
  const busy = adjust.isPending && adjust.variables?.userId === user._id;

  const send = (sign) =>
    adjust.mutate(
      { userId: user._id, amount: sign * value, reason: 'Adjusted by an admin' },
      { onSuccess: () => setAmount('') },
    );

  return (
    <span className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
        <Coins className="h-4 w-4" aria-hidden="true" />
        <span className="tabular-nums text-ink">{user.credits ?? 0}</span>
      </span>
      <Input
        aria-label={`Credits to adjust for ${user.email}`}
        className="w-20"
        inputMode="numeric"
        placeholder="0"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <Button size="sm" disabled={!valid || busy} onClick={() => send(1)}>
        Add
      </Button>
      <Button size="sm" disabled={!valid || busy} onClick={() => send(-1)}>
        Take
      </Button>
    </span>
  );
}

/**
 * SYSTEM-DERIVED, and deliberately not in the sidebar — the approved frames draw
 * no admin row, and an operations screen does not belong in a customer's
 * navigation. Reachable at /admin by an account with the admin role.
 *
 * Counts only. An operator needs to know whether generation is failing, not what
 * anybody wrote.
 */
function Stat({ label, value, tone }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={tone ?? 'text-ink'}>
        <span className="text-section font-bold">{value}</span>
      </p>
    </Card>
  );
}

export function AdminPage() {
  const role = useAuthStore((state) => state.user?.role);
  const admin = useAdmin();

  // The server enforces this too; the redirect just avoids showing a screen
  // whose every request would be refused.
  if (role && role !== 'admin') return <Navigate to="/" replace />;

  if (admin.isError) {
    return (
      <AppShell>
        <Callout tone="danger" className="mt-6">
          <span className="flex w-full items-center justify-between gap-4">
            <span>Could not load the admin overview. This screen is admin-only.</span>
            <Button size="sm" onClick={admin.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      </AppShell>
    );
  }

  const overview = admin.overview;
  const providers = overview?.providers ?? {};

  return (
    <AppShell>
      <PageHeader title="Admin" subtitle="Operational counts and account support." />

      <div className="mt-6 grid grid-cols-4 gap-4">
        <Stat label="Accounts" value={overview?.users ?? '—'} />
        <Stat label="Books" value={overview?.books ?? '—'} />
        <Stat
          label="Failures (24h)"
          value={overview?.failuresLast24h ?? '—'}
          tone={overview?.failuresLast24h > 0 ? 'text-danger' : 'text-ink'}
        />
        <Stat
          label="Stored objects"
          value={overview ? overview.storage.objects.toLocaleString() : '—'}
        />
      </div>

      <div className="mt-6">
        <SectionHeading size="lg">Providers</SectionHeading>
        <ul className="mt-3 flex flex-wrap gap-3">
          {[
            ['Gemini', providers.gemini?.configured, providers.gemini?.model],
            ['Kie.ai', providers.kie?.configured, providers.kie?.model],
            ['Storage', providers.storage?.driver !== 'memory', providers.storage?.driver],
          ].map(([name, ok, detail]) => (
            <li key={name}>
              <Card className="flex items-center gap-3 p-3">
                <ShieldCheck
                  className={ok ? 'h-4 w-4 text-success' : 'h-4 w-4 text-warning'}
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{name}</span>
                  <span className="block text-xs text-ink-muted">{detail ?? '—'}</span>
                </span>
                <StatusBadge tone={ok ? 'success' : 'warning'} dot>
                  {ok ? 'Configured' : 'Not configured'}
                </StatusBadge>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 pb-6">
        <SectionHeading size="lg" count={admin.users.length}>
          Accounts
        </SectionHeading>

        <div className="mt-3 max-w-[360px]">
          <Input
            aria-label="Search accounts"
            placeholder="Search by name or email"
            value={admin.search}
            onChange={(event) => admin.setSearch(event.target.value)}
          />
        </div>

        {admin.isPending ? (
          <p role="status" className="mt-4 text-sm text-ink-muted">
            Loading…
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {admin.users.map((user) => (
              <li key={user._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{user.email}</span>
                </span>

                {user.role === 'admin' && <StatusBadge tone="neutral">Admin</StatusBadge>}

                <CreditControl user={user} adjust={admin.adjustCredits} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pb-6">
        <SectionHeading size="lg" count={admin.audit.length}>
          Audit trail
        </SectionHeading>

        {admin.audit.length === 0 ? (
          <Callout className="mt-3">Nothing recorded yet.</Callout>
        ) : (
          <ul className="mt-3 divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {admin.audit.map((entry) => (
              <li key={entry._id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Activity className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                <span className="flex-1 truncate text-ink">{entry.action}</span>
                <span className="text-xs text-ink-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

export default AdminPage;
