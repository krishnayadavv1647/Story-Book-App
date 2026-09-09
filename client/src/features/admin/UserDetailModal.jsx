import { Modal, StatusBadge } from '../../components/common/index.js';
import { useUserDetail } from './useAdmin.js';

/**
 * Everything about one account, for the moment an operator has to answer a
 * question about a specific person.
 *
 * Read-only on purpose: the actions that change an account live on its row in
 * the list, so there is one place each of them can be done from.
 */

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 last:border-b-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-right text-sm text-ink">{children}</span>
    </div>
  );
}

export function UserDetailModal({ userId, onOpenChange }) {
  const { detail, isPending, isError } = useUserDetail(userId);

  const jobs = detail?.jobs ?? {};
  const failed = jobs.failed ?? 0;

  return (
    <Modal
      open={Boolean(userId)}
      onOpenChange={onOpenChange}
      size="lg"
      title={detail?.user?.name ?? 'Account'}
      description={detail?.user?.email ?? 'Loading this account…'}
    >
      {isPending && (
        <p role="status" className="text-sm text-ink-muted">
          Loading…
        </p>
      )}
      {isError && <p className="text-sm text-danger">Could not load this account.</p>}

      {detail && (
        <div className="grid gap-5 sm:grid-cols-2">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Account
            </h3>
            <div className="mt-2">
              <Row label="Status">
                <StatusBadge tone={detail.user.status === 'active' ? 'success' : 'danger'} dot>
                  {detail.user.status}
                </StatusBadge>
              </Row>
              <Row label="Role">{detail.user.role}</Row>
              <Row label="Joined">{formatDate(detail.user.createdAt)}</Row>
              <Row label="Last signed in">{formatDate(detail.user.lastLoginAt)}</Row>
              <Row label="Email verified">{detail.user.emailVerifiedAt ? 'Yes' : 'No'}</Row>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Usage</h3>
            <div className="mt-2">
              <Row label="Credits">
                <span className="tabular-nums">{detail.user.credits}</span>
              </Row>
              <Row label="Plan">{detail.subscription ? detail.subscription.plan.name : 'None'}</Row>
              {detail.subscription && detail.subscription.plan.interval !== 'lifetime' && (
                <Row label="Renews">{formatDate(detail.subscription.currentPeriodEnd)}</Row>
              )}
              <Row label="Books">{detail.books}</Row>
              <Row label="Generation jobs">
                {Object.values(jobs).reduce((sum, count) => sum + count, 0)}
                {failed > 0 && <span className="ml-2 text-danger">{failed} failed</span>}
              </Row>
            </div>
          </section>

          <section className="sm:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Recent credit movements
            </h3>
            {detail.ledger.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>
            ) : (
              <ul className="mt-2">
                {detail.ledger.map((entry) => (
                  <li
                    key={entry._id}
                    className="flex items-center justify-between gap-4 border-b border-hairline py-2 text-sm last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {entry.reason || entry.type}
                    </span>
                    <span className="text-xs text-ink-muted">{formatDate(entry.createdAt)}</span>
                    <span
                      className={
                        entry.amount > 0
                          ? 'w-16 text-right font-semibold text-success'
                          : 'w-16 text-right font-semibold text-ink'
                      }
                    >
                      {entry.amount > 0 ? '+' : ''}
                      {entry.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

export default UserDetailModal;
