import { useState } from 'react';
import { Check, Coins, Minus, Plus } from 'lucide-react';

import { cn } from '../lib/cn.js';
import { AppShell, PageHeader } from '../components/layout/index.js';
import { Button, Callout, Card, SectionHeading } from '../components/common/index.js';
import { useCreditHistory, useCredits } from '../features/credits/useCredits.js';
import { usePlans } from '../features/plans/usePlans.js';

/**
 * SYSTEM-DERIVED. No frame covers credits.
 *
 * Two questions, in this order: what is left, and where did the rest go. The
 * price list sits between them because "90 credits" means nothing until you
 * know a page costs five.
 */

/** What each priced kind of work is called on screen. */
const PRICE_LABELS = [
  ['story_plan', 'Writing a story'],
  ['page_image', 'One illustration'],
  ['character_image', 'Designing a character'],
  ['story_chat', 'A message to the assistant'],
];

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function LedgerRow({ entry }) {
  const isCredit = entry.amount > 0;

  return (
    <li className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isCredit ? 'bg-surface-elevated text-success' : 'bg-surface-hover text-ink-muted',
        )}
        aria-hidden="true"
      >
        {isCredit ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">
          {entry.reason || (isCredit ? 'Credits added' : 'Credits spent')}
        </span>
        <span className="block text-xs text-ink-muted">{formatDate(entry.createdAt)}</span>
      </span>

      <span className="shrink-0 text-right">
        <span className={cn('block text-sm font-semibold', isCredit ? 'text-success' : 'text-ink')}>
          {isCredit ? '+' : ''}
          {entry.amount}
        </span>
        <span className="block text-xs text-ink-muted">{entry.balanceAfter} left</span>
      </span>
    </li>
  );
}

const INTERVAL_LABEL = { month: '/month', year: '/year', lifetime: ' one-off' };

function planPrice(plan) {
  if (!plan.priceCents) return 'Free';
  const amount = (plan.priceCents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: plan.currency || 'USD',
  });
  return `${amount}${INTERVAL_LABEL[plan.interval] ?? ''}`;
}

/**
 * One plan on offer.
 *
 * There is no checkout, so no card has a buy button — saying "ask us to switch"
 * is honest, where a button that does nothing is not.
 */
function PlanCard({ plan, current }) {
  return (
    <li
      className={cn(
        'rounded-lg border p-4',
        current ? 'border-hairline-strong bg-teal-soft' : 'border-hairline bg-surface',
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{plan.name}</span>
        <span className="text-sm text-ink">{planPrice(plan)}</span>
      </span>

      {plan.description && (
        <span className="mt-1 block text-xs text-ink-muted">{plan.description}</span>
      )}

      <span className="mt-3 flex items-center gap-1.5 text-sm text-ink">
        <Coins className="h-4 w-4 text-gold" aria-hidden="true" />
        <span className="tabular-nums font-semibold">{plan.creditsGranted}</span>
        <span className="text-ink-muted">credits</span>
      </span>

      {plan.features?.length > 0 && (
        <ul className="mt-3 grid gap-1">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs text-ink-muted">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
      )}

      {current && (
        <span className="mt-3 block text-xs font-semibold text-ink">You are on this plan</span>
      )}
    </li>
  );
}

export function CreditsPage() {
  const [page, setPage] = useState(1);
  const credits = useCredits();
  const history = useCreditHistory({ page, limit: 25 });
  const { plans, current } = usePlans();

  const pages = Math.max(1, Math.ceil(history.total / history.limit));

  return (
    <AppShell>
      <PageHeader title="Credits" subtitle="What you have left, and what it went on." />

      {(credits.isError || history.isError) && (
        <Callout tone="danger" className="mt-5">
          <span className="flex w-full items-center justify-between gap-4">
            <span>We could not load your credits.</span>
            <Button
              size="sm"
              onClick={() => {
                credits.refetch();
                history.refetch();
              }}
            >
              Try again
            </Button>
          </span>
        </Callout>
      )}

      <div className="mt-6 grid max-w-[900px] gap-5 pb-6">
        <Card className="flex items-center gap-4 p-5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-gold"
            aria-hidden="true"
          >
            <Coins className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-3xl font-semibold text-ink">
              {credits.isPending ? '—' : credits.balance}
            </span>
            <span className="block text-sm text-ink-muted">
              credits left{current ? ` · ${current.plan.name} plan` : ''}
            </span>
          </span>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">What things cost</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {PRICE_LABELS.map(([key, label]) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-sm border border-hairline px-3 py-2 text-sm"
              >
                <span className="text-ink-muted">{label}</span>
                <span className="font-semibold text-ink">{credits.prices[key] ?? '—'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">
            Work that fails is refunded automatically — you only pay for what you get. Run out and
            an admin can top your account up.
          </p>
        </Card>

        {plans.length > 0 && (
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink">Plans</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Each plan tops your balance up by the credits shown. There is no checkout yet — ask us
              to switch you over.
            </p>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} current={current?.plan?.key === plan.key} />
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5">
          <SectionHeading size="lg" count={history.total}>
            History
          </SectionHeading>

          {history.isPending ? (
            <p role="status" className="py-6 text-sm text-ink-muted">
              Loading your history…
            </p>
          ) : history.items.length === 0 ? (
            <p className="py-6 text-sm text-ink-muted">Nothing spent yet.</p>
          ) : (
            <ul className="mt-2">
              {history.items.map((entry) => (
                <LedgerRow key={entry._id} entry={entry} />
              ))}
            </ul>
          )}

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-ink-muted">
                Page {page} of {pages}
              </span>
              <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

export default CreditsPage;
