import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCheck, CircleAlert, CircleCheck, Info } from 'lucide-react';

import { cn } from '../lib/cn.js';
import { AppShell, PageHeader } from '../components/layout/index.js';
import { Button, Callout, SectionHeading, SegmentedTabs } from '../components/common/index.js';
import { useNotifications } from '../features/account/useAccount.js';

/**
 * SYSTEM-DERIVED. The frames draw a Notifications row but no screen.
 *
 * Rows are produced by the server when work actually finishes — an illustrated
 * book, a finished or failed export — so this reflects what happened even when
 * the browser was closed at the time.
 */
const SEVERITY = {
  info: { icon: Info, tone: 'text-ink-muted' },
  success: { icon: CircleCheck, tone: 'text-success' },
  warning: { icon: AlertTriangle, tone: 'text-warning' },
  error: { icon: CircleAlert, tone: 'text-danger' },
};

export function NotificationsPage() {
  const [filter, setFilter] = useState('all');
  const notifications = useNotifications({ unreadOnly: filter === 'unread' });

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        subtitle="What finished, what failed, and what needs another go."
        actions={
          <Button
            size="xl"
            leadingIcon={CheckCheck}
            disabled={notifications.unread === 0}
            loading={notifications.markAllRead.isPending}
            onClick={() => notifications.markAllRead.mutate()}
          >
            Mark all read
          </Button>
        }
      />

      <div className="mt-5 max-w-[360px]">
        <SegmentedTabs
          value={filter}
          onValueChange={setFilter}
          items={[
            { value: 'all', label: 'All', icon: Bell },
            { value: 'unread', label: 'Unread', icon: CircleAlert },
          ]}
        />
      </div>

      {notifications.isError && (
        <Callout tone="danger" className="mt-5">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load your notifications.</span>
            <Button size="sm" onClick={notifications.refetch}>
              Try again
            </Button>
          </span>
        </Callout>
      )}

      <div className="mt-6 pb-6">
        <SectionHeading size="lg" count={notifications.items.length}>
          {filter === 'unread' ? 'Unread' : 'Everything'}
        </SectionHeading>

        {notifications.isPending ? (
          <p role="status" className="mt-4 text-sm text-ink-muted">
            Loading…
          </p>
        ) : notifications.items.length === 0 ? (
          <Callout className="mt-4">
            {filter === 'unread' ? 'Nothing unread.' : 'Nothing to report yet.'}
          </Callout>
        ) : (
          <ul className="mt-4 divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {notifications.items.map((item) => {
              const severity = SEVERITY[item.severity] ?? SEVERITY.info;
              const Icon = severity.icon;
              const unread = !item.readAt;

              return (
                <li
                  key={item._id}
                  className={cn('flex items-start gap-3 px-4 py-3', unread && 'bg-teal-soft')}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', severity.tone)} aria-hidden="true" />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{item.title}</span>
                      {unread && (
                        <span
                          aria-label="Unread"
                          className="h-1.5 w-1.5 shrink-0 rounded-pill bg-teal-bright"
                        />
                      )}
                    </span>
                    {item.body && <span className="block text-sm text-ink-muted">{item.body}</span>}
                    <span className="block text-xs text-ink-muted">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {item.actionPath && (
                      <Link
                        to={item.actionPath}
                        onClick={() => unread && notifications.markRead.mutate(item._id)}
                        className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                    )}
                    {unread && (
                      <Button size="sm" onClick={() => notifications.markRead.mutate(item._id)}>
                        Mark read
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

export default NotificationsPage;
