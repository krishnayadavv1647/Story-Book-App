import { useState } from 'react';
import { Check, Copy, Gift, Plus } from 'lucide-react';

import {
  Button,
  Callout,
  Card,
  Field,
  Input,
  SectionHeading,
  Select,
  StatusBadge,
  Switch,
} from '../../components/common/index.js';
import { ApiClientError } from '../../api/client.js';

/**
 * Bonus sign-up links.
 *
 * A link is the whole of the access control — anyone holding it can use it — so
 * the useful controls are exactly these: make one for a plan, copy it, see how
 * often it has actually been redeemed, and switch it off the moment it turns up
 * somewhere it should not be. Nothing is deleted; a switched-off link keeps its
 * count, which is the record of what the campaign did.
 */

/** The shareable URL for a code, on whichever host is serving this app. */
export function bonusLinkUrl(code) {
  return `${window.location.origin}/join/${code}`;
}

const describe = (error) =>
  error instanceof ApiClientError ? error.message : 'Something went wrong. Please try again.';

export function AdminBonusLinks({ admin }) {
  const [label, setLabel] = useState('');
  const [planId, setPlanId] = useState('');
  const [copied, setCopied] = useState(null);

  const assignable = admin.plans.filter((plan) => plan.isActive);
  const error = admin.createBonusLink.error || admin.updateBonusLink.error;

  const create = () =>
    admin.createBonusLink.mutate(
      { label: label.trim(), planId },
      {
        onSuccess: () => {
          setLabel('');
          setPlanId('');
        },
      },
    );

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(bonusLinkUrl(code));
      setCopied(code);
      setTimeout(() => setCopied((current) => (current === code ? null : current)), 2000);
    } catch {
      // Clipboard blocked by the browser. The URL is on screen to copy by hand.
    }
  };

  return (
    <div className="pb-6">
      <SectionHeading size="lg" count={admin.bonusLinks.length}>
        Bonus links
      </SectionHeading>
      <p className="mt-1 text-sm text-ink-muted">
        Whoever signs up through a link and confirms their email lands on its plan. Everyone else
        gets the ordinary opening credits.
      </p>

      {error && (
        <Callout tone="danger" className="mt-3">
          {describe(error)}
        </Callout>
      )}

      {assignable.length === 0 ? (
        <Callout className="mt-3">
          Create an active plan first — a link has to put people on something.
        </Callout>
      ) : (
        <Card className="mt-3 flex flex-wrap items-end gap-3 p-4">
          <Field label="Link name" className="min-w-[200px] flex-1">
            <Input
              value={label}
              placeholder="Cinema Studio buyers"
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <Field label="Plan it grants" className="w-60">
            <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">Choose a plan</option>
              {assignable.map((plan) => (
                <option key={plan._id} value={plan._id}>
                  {plan.name} (+{plan.creditsGranted})
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="primary"
            leadingIcon={Plus}
            disabled={!label.trim() || !planId || admin.createBonusLink.isPending}
            loading={admin.createBonusLink.isPending}
            onClick={create}
          >
            Create link
          </Button>
        </Card>
      )}

      {admin.bonusLinks.length > 0 && (
        <ul className="mt-3 grid gap-3">
          {admin.bonusLinks.map((link) => {
            const url = bonusLinkUrl(link.code);
            const busy =
              admin.updateBonusLink.isPending &&
              admin.updateBonusLink.variables?.linkId === link._id;

            return (
              <li key={link._id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Gift className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {link.label}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {link.planId?.name ?? 'Plan removed'} · +{link.planId?.creditsGranted ?? 0}{' '}
                        credits
                      </span>
                    </span>
                    <span className="text-sm text-ink">
                      <span className="font-semibold tabular-nums">{link.uses}</span>{' '}
                      <span className="text-ink-muted">redeemed</span>
                    </span>
                    <StatusBadge tone={link.isActive ? 'success' : 'neutral'} dot>
                      {link.isActive ? 'Active' : 'Off'}
                    </StatusBadge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <code className="min-w-0 flex-1 truncate rounded-sm border border-hairline bg-surface-elevated px-3 py-2 text-xs text-ink">
                      {url}
                    </code>
                    <Button
                      size="sm"
                      leadingIcon={copied === link.code ? Check : Copy}
                      onClick={() => copy(link.code)}
                      aria-label={`Copy link for ${link.label}`}
                    >
                      {copied === link.code ? 'Copied' : 'Copy'}
                    </Button>
                    <Switch
                      label={`${link.label} is active`}
                      checked={link.isActive}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        admin.updateBonusLink.mutate({
                          linkId: link._id,
                          patch: { isActive: checked },
                        })
                      }
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default AdminBonusLinks;
