import { useState } from 'react';
import { Ban, Coins, Minus, Plus, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react';

import {
  Button,
  Callout,
  ConfirmDialog,
  Input,
  SectionHeading,
  Select,
  StatusBadge,
} from '../../components/common/index.js';
import { ApiClientError } from '../../api/client.js';
import { useAuthStore } from '../../store/authStore.js';
import { UserDetailModal } from './UserDetailModal.jsx';

/**
 * The accounts list: who is here, what they are on, and the four things an
 * operator can do about it — credits, plan, suspension, role.
 *
 * Every one of those is on the row rather than behind a detail screen, because
 * the common case is "find this person and give them credits", and making that
 * two navigations turns a ten-second job into a chore.
 */

const describe = (error) =>
  error instanceof ApiClientError ? error.message : 'Something went wrong. Please try again.';

/** Credits in and out. Signed on the wire; the two buttons choose the sign. */
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
      <Button size="sm" leadingIcon={Plus} disabled={!valid || busy} onClick={() => send(1)}>
        Add
      </Button>
      <Button size="sm" leadingIcon={Minus} disabled={!valid || busy} onClick={() => send(-1)}>
        Take
      </Button>
    </span>
  );
}

/**
 * Which plan this account is on, and a way to change it.
 *
 * Assigning grants the plan's credits, so the select acts immediately rather
 * than waiting for a Save — and says as much in its label.
 */
function PlanControl({ user, plans, assign, cancel }) {
  const assignable = plans.filter((plan) => plan.isActive);
  const busy =
    (assign.isPending && assign.variables?.userId === user._id) ||
    (cancel.isPending && cancel.variables?.userId === user._id);

  return (
    <span className="flex items-center gap-2">
      <Select
        aria-label={`Plan for ${user.email}`}
        className="w-40"
        value=""
        disabled={busy || assignable.length === 0}
        onChange={(event) => {
          const planId = event.target.value;
          if (planId) assign.mutate({ userId: user._id, planId });
        }}
      >
        <option value="">{user.plan ? user.plan.name : 'No plan'}</option>
        {assignable.map((plan) => (
          <option key={plan._id} value={plan._id}>
            Give {plan.name} (+{plan.creditsGranted})
          </option>
        ))}
      </Select>
      {user.plan && (
        <Button size="sm" disabled={busy} onClick={() => cancel.mutate({ userId: user._id })}>
          Clear
        </Button>
      )}
    </span>
  );
}

export function AdminAccounts({ admin }) {
  const meId = useAuthStore((state) => state.user?.id);
  const [detailFor, setDetailFor] = useState(null);
  const [suspending, setSuspending] = useState(null);

  const error =
    admin.adjustCredits.error ||
    admin.updateUser.error ||
    admin.assignPlan.error ||
    admin.cancelPlan.error;

  return (
    <div className="pb-6">
      <SectionHeading size="lg" count={admin.totalUsers}>
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

      {error && (
        <Callout tone="danger" className="mt-3">
          {describe(error)}
        </Callout>
      )}

      {admin.isPending ? (
        <p role="status" className="mt-4 text-sm text-ink-muted">
          Loading…
        </p>
      ) : admin.users.length === 0 ? (
        <Callout className="mt-3">No accounts match that search.</Callout>
      ) : (
        <ul className="mt-4 divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {admin.users.map((user) => {
            // An admin cannot suspend or demote themselves — the server refuses
            // it, and offering the button anyway would just be a trap.
            const isSelf = String(user._id) === String(meId);
            const suspended = user.status !== 'active';

            return (
              <li key={user._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setDetailFor(user._id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-semibold text-ink underline-offset-4 hover:underline">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">{user.email}</span>
                </button>

                {user.role === 'admin' && <StatusBadge tone="accent">Admin</StatusBadge>}
                {suspended && (
                  <StatusBadge tone="danger" dot>
                    Suspended
                  </StatusBadge>
                )}

                <CreditControl user={user} adjust={admin.adjustCredits} />

                <PlanControl
                  user={user}
                  plans={admin.plans}
                  assign={admin.assignPlan}
                  cancel={admin.cancelPlan}
                />

                {!isSelf && (
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      leadingIcon={suspended ? RotateCcw : Ban}
                      onClick={() =>
                        suspended
                          ? admin.updateUser.mutate({
                              userId: user._id,
                              patch: { status: 'active' },
                            })
                          : setSuspending(user)
                      }
                    >
                      {suspended ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button
                      size="sm"
                      leadingIcon={user.role === 'admin' ? ShieldOff : ShieldCheck}
                      onClick={() =>
                        admin.updateUser.mutate({
                          userId: user._id,
                          patch: { role: user.role === 'admin' ? 'user' : 'admin' },
                        })
                      }
                    >
                      {user.role === 'admin' ? 'Remove admin' : 'Make admin'}
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {admin.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            size="sm"
            disabled={admin.page === 1}
            onClick={() => admin.setPage(admin.page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-ink-muted">
            Page {admin.page} of {admin.totalPages}
          </span>
          <Button
            size="sm"
            disabled={admin.page >= admin.totalPages}
            onClick={() => admin.setPage(admin.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <UserDetailModal userId={detailFor} onOpenChange={(open) => !open && setDetailFor(null)} />

      <ConfirmDialog
        open={Boolean(suspending)}
        onOpenChange={(next) => !next && setSuspending(null)}
        title={`Suspend ${suspending?.name ?? ''}?`}
        description="They are signed out everywhere and cannot sign in again until you reactivate them. Their books and credits are untouched."
        confirmLabel="Suspend"
        destructive
        loading={admin.updateUser.isPending}
        onConfirm={() => {
          admin.updateUser.mutate({ userId: suspending._id, patch: { status: 'suspended' } });
          setSuspending(null);
        }}
      />
    </div>
  );
}

export default AdminAccounts;
