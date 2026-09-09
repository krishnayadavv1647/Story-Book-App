import { useState } from 'react';
import { Coins, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  Button,
  Callout,
  Card,
  ConfirmDialog,
  SectionHeading,
  StatusBadge,
} from '../../components/common/index.js';
import { ApiClientError } from '../../api/client.js';
import { PlanForm } from './PlanForm.jsx';

/**
 * The plans an admin offers.
 *
 * There is no checkout, so a plan does one thing that matters: assigning it
 * hands over its credits. The price is a label, which is why the credits sit
 * next to it in the same line rather than being buried in the edit form.
 */

const INTERVAL_LABEL = { month: '/month', year: '/year', lifetime: ' one-off' };

function price(plan) {
  if (!plan.priceCents) return 'Free';
  const amount = (plan.priceCents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: plan.currency || 'USD',
  });
  return `${amount}${INTERVAL_LABEL[plan.interval] ?? ''}`;
}

const describe = (error) =>
  error instanceof ApiClientError ? error.message : 'Something went wrong. Please try again.';

export function AdminPlans({ admin }) {
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const saving = admin.createPlan.isPending || admin.updatePlan.isPending;
  const error = admin.createPlan.error || admin.updatePlan.error || admin.deletePlan.error;

  const open = (plan = null) => {
    setEditing(plan);
    admin.createPlan.reset();
    admin.updatePlan.reset();
    setFormOpen(true);
  };

  const submit = (payload) => {
    const mutation = editing ? admin.updatePlan : admin.createPlan;
    const input = editing ? { planId: editing._id, patch: payload } : payload;
    mutation.mutate(input, { onSuccess: () => setFormOpen(false) });
  };

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading size="lg" count={admin.plans.length}>
          Plans
        </SectionHeading>
        <Button variant="primary" leadingIcon={Plus} onClick={() => open()}>
          New plan
        </Button>
      </div>

      {error && !formOpen && (
        <Callout tone="danger" className="mt-3">
          {describe(error)}
        </Callout>
      )}

      {admin.plans.length === 0 ? (
        <Callout className="mt-3">
          No plans yet. Create one to hand accounts a bundle of credits.
        </Callout>
      ) : (
        <ul className="mt-3 grid gap-3">
          {admin.plans.map((plan) => (
            <li key={plan._id}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{plan.name}</span>
                    <span className="text-xs text-ink-muted">{plan.key}</span>
                    {!plan.isActive && <StatusBadge tone="danger">Withdrawn</StatusBadge>}
                    {plan.isActive && !plan.visibleToUsers && (
                      <StatusBadge tone="neutral">Hidden</StatusBadge>
                    )}
                    {plan.isActive && plan.visibleToUsers && (
                      <StatusBadge tone="success">Shown to users</StatusBadge>
                    )}
                  </span>
                  {plan.description && (
                    <span className="mt-0.5 block truncate text-xs text-ink-muted">
                      {plan.description}
                    </span>
                  )}
                </span>

                <span className="text-sm text-ink">{price(plan)}</span>

                <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <Coins className="h-4 w-4 text-gold" aria-hidden="true" />
                  <span className="tabular-nums">{plan.creditsGranted}</span>
                </span>

                <span className="flex gap-2">
                  <Button size="sm" leadingIcon={Pencil} onClick={() => open(plan)}>
                    Edit
                  </Button>
                  <Button size="sm" leadingIcon={Trash2} onClick={() => setConfirming(plan)}>
                    Withdraw
                  </Button>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <PlanForm
        open={formOpen}
        onOpenChange={setFormOpen}
        plan={editing}
        onSubmit={submit}
        saving={saving}
        error={error && formOpen ? describe(error) : null}
      />

      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(next) => !next && setConfirming(null)}
        title={`Withdraw ${confirming?.name ?? ''}?`}
        // Deleting a plan somebody is on would leave their subscription pointing
        // at nothing, so the server keeps it and just switches it off. Saying so
        // here means the outcome is not a surprise.
        description="It stops being assignable and disappears for readers. If any account is on it, the plan is kept so their subscription still resolves."
        confirmLabel="Withdraw"
        destructive
        loading={admin.deletePlan.isPending}
        onConfirm={() => {
          admin.deletePlan.mutate({ planId: confirming._id });
          setConfirming(null);
        }}
      />
    </div>
  );
}

export default AdminPlans;
