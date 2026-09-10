import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Activity, Gauge, ShieldCheck, Tags, Users } from 'lucide-react';

import { AppShell, PageHeader } from '../components/layout/index.js';
import {
  Button,
  Callout,
  Card,
  SectionHeading,
  SegmentedTabs,
  StatusBadge,
  TabPanel,
} from '../components/common/index.js';
import { useAdmin } from '../features/admin/useAdmin.js';
import { AdminAccounts } from '../features/admin/AdminAccounts.jsx';
import { AdminPlans } from '../features/admin/AdminPlans.jsx';
import { useAuthStore } from '../store/authStore.js';

/**
 * SYSTEM-DERIVED — the approved frames draw no admin row. Reachable at /admin by
 * an account with the admin role, and linked from the sidebar footer for those
 * accounts only (added at the user's request, 2026-09-09; it was deliberately
 * unlinked before that).
 *
 * Four tabs rather than one long scroll: an operator arrives with one job in
 * mind — check the numbers, find a person, price a plan, read the trail — and
 * each of those is a different screen's worth of detail.
 *
 * Counts only in the overview. An operator needs to know whether generation is
 * failing, not what anybody wrote.
 */
function Stat({ label, value, tone, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={tone ?? 'text-ink'}>
        <span className="text-section font-bold">{value}</span>
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

/**
 * "13 created · 1 in progress · 1 failed", leaving out whatever is zero.
 *
 * The headline is the books actually finished; this line is what the rest of
 * the book records are, so the two numbers never look like they disagree.
 */
function bookBreakdown({ books = 0, booksInProgress = 0, booksFailed = 0 }) {
  return [
    `${books} created`,
    booksInProgress ? `${booksInProgress} in progress` : null,
    booksFailed ? `${booksFailed} failed` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Overview({ admin }) {
  const overview = admin.overview;
  const providers = overview?.providers ?? {};

  return (
    <div className="pb-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Accounts" value={overview?.users ?? '—'} />
        <Stat
          label="Books generated"
          value={overview?.booksGenerated ?? '—'}
          hint={overview ? bookBreakdown(overview) : null}
        />
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
    </div>
  );
}

function AuditTrail({ admin }) {
  return (
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
              {entry.reason && (
                <span className="hidden truncate text-xs text-ink-muted sm:block">
                  {entry.reason}
                </span>
              )}
              <span className="text-xs text-ink-muted">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminPage() {
  const role = useAuthStore((state) => state.user?.role);
  const admin = useAdmin();
  const [tab, setTab] = useState('overview');

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

  return (
    <AppShell>
      <PageHeader title="Admin" subtitle="Operational counts, accounts, and plans." />

      <SegmentedTabs
        value={tab}
        onValueChange={setTab}
        className="mt-5"
        items={[
          { value: 'overview', label: 'Overview', icon: Gauge },
          { value: 'accounts', label: 'Accounts', icon: Users },
          { value: 'plans', label: 'Plans', icon: Tags },
          { value: 'audit', label: 'Audit', icon: Activity },
        ]}
      >
        <div className="mt-6">
          <TabPanel value="overview">
            <Overview admin={admin} />
          </TabPanel>
          <TabPanel value="accounts">
            <AdminAccounts admin={admin} />
          </TabPanel>
          <TabPanel value="plans">
            <AdminPlans admin={admin} />
          </TabPanel>
          <TabPanel value="audit">
            <AuditTrail admin={admin} />
          </TabPanel>
        </div>
      </SegmentedTabs>
    </AppShell>
  );
}

export default AdminPage;
