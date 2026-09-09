import { useEffect, useState } from 'react';

import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
} from '../../components/common/index.js';

/**
 * Create or edit one plan.
 *
 * A plan is drafted before anybody sees it, so "Show to users" is a deliberate,
 * separate switch from "Active" — the two answer different questions: whether
 * the plan may be assigned at all, and whether readers are told it exists.
 */

/** `starter plan!` -> `starter-plan`, so the key is one less thing to type. */
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const EMPTY = {
  name: '',
  key: '',
  description: '',
  price: '',
  currency: 'USD',
  interval: 'month',
  creditsGranted: '',
  sortOrder: '0',
  features: '',
  maxBooks: '',
  maxPagesPerBook: '',
  maxCharacters: '',
  maxExportsPerMonth: '',
  watermarkFreeExports: false,
  printQualityExports: false,
  isActive: true,
  visibleToUsers: false,
};

/** A plan document -> the form's own string-shaped state. */
function toForm(plan) {
  if (!plan) return EMPTY;
  const limits = plan.limits ?? {};
  const text = (value) => (value === null || value === undefined ? '' : String(value));

  return {
    name: plan.name ?? '',
    key: plan.key ?? '',
    description: plan.description ?? '',
    price: plan.priceCents ? String(plan.priceCents / 100) : '0',
    currency: plan.currency ?? 'USD',
    interval: plan.interval ?? 'month',
    creditsGranted: text(plan.creditsGranted),
    sortOrder: text(plan.sortOrder ?? 0),
    features: (plan.features ?? []).join('\n'),
    maxBooks: text(limits.maxBooks),
    maxPagesPerBook: text(limits.maxPagesPerBook),
    maxCharacters: text(limits.maxCharacters),
    maxExportsPerMonth: text(limits.maxExportsPerMonth),
    watermarkFreeExports: Boolean(limits.watermarkFreeExports),
    printQualityExports: Boolean(limits.printQualityExports),
    isActive: plan.isActive !== false,
    visibleToUsers: Boolean(plan.visibleToUsers),
  };
}

/** Blank means "no limit", which is a different statement from zero. */
const limitOf = (value) => (String(value).trim() === '' ? null : Number(value));

function toPayload(form) {
  return {
    key: form.key.trim(),
    name: form.name.trim(),
    description: form.description.trim(),
    priceCents: Math.round(Number(form.price || 0) * 100),
    currency: form.currency.trim().toUpperCase(),
    interval: form.interval,
    creditsGranted: Number(form.creditsGranted || 0),
    sortOrder: Number(form.sortOrder || 0),
    features: form.features
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    limits: {
      maxBooks: limitOf(form.maxBooks),
      maxPagesPerBook: limitOf(form.maxPagesPerBook),
      maxCharacters: limitOf(form.maxCharacters),
      maxExportsPerMonth: limitOf(form.maxExportsPerMonth),
      watermarkFreeExports: form.watermarkFreeExports,
      printQualityExports: form.printQualityExports,
    },
    isActive: form.isActive,
    visibleToUsers: form.visibleToUsers,
  };
}

function LimitField({ label, value, onChange }) {
  return (
    <Field label={label} hint="Blank means no limit">
      <Input inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

export function PlanForm({ open, onOpenChange, plan, onSubmit, saving, error }) {
  const [form, setForm] = useState(EMPTY);
  // The key follows the name until somebody types their own; after that it is
  // theirs, and an edit to the name must not quietly rewrite it.
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(plan));
    setKeyTouched(Boolean(plan));
  }, [open, plan]);

  const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));
  const setInput = (field) => (event) => set(field)(event.target.value);

  const valid = form.name.trim() && form.key.trim();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      description="A plan is a price, the credits it hands over, and the limits it describes."
      footer={
        <span className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid || saving}
            loading={saving}
            onClick={() => onSubmit(toPayload(form))}
          >
            {plan ? 'Save plan' : 'Create plan'}
          </Button>
        </span>
      }
    >
      {error && (
        <Callout tone="danger" className="mb-4">
          {error}
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(event) => {
              const { value } = event.target;
              setForm((current) => ({
                ...current,
                name: value,
                key: keyTouched ? current.key : slugify(value),
              }));
            }}
          />
        </Field>
        <Field label="Key" hint="Lowercase, dashes. Used in URLs and reports.">
          <Input
            value={form.key}
            onChange={(event) => {
              setKeyTouched(true);
              set('key')(event.target.value);
            }}
          />
        </Field>
      </div>

      <Field label="Description" className="mt-4">
        <Input value={form.description} onChange={setInput('description')} />
      </Field>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Field label="Price" hint="Shown only — there is no checkout yet.">
          <Input inputMode="decimal" value={form.price} onChange={setInput('price')} />
        </Field>
        <Field label="Currency">
          <Input value={form.currency} onChange={setInput('currency')} maxLength={3} />
        </Field>
        <Field label="Billing">
          <Select value={form.interval} onChange={setInput('interval')}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="lifetime">One-off</option>
          </Select>
        </Field>
        <Field label="Credits" hint="Handed over on assignment.">
          <Input
            inputMode="numeric"
            value={form.creditsGranted}
            onChange={setInput('creditsGranted')}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <LimitField label="Max books" value={form.maxBooks} onChange={set('maxBooks')} />
        <LimitField
          label="Pages per book"
          value={form.maxPagesPerBook}
          onChange={set('maxPagesPerBook')}
        />
        <LimitField
          label="Max characters"
          value={form.maxCharacters}
          onChange={set('maxCharacters')}
        />
        <LimitField
          label="Exports / month"
          value={form.maxExportsPerMonth}
          onChange={set('maxExportsPerMonth')}
        />
      </div>

      <Field label="Features" hint="One per line. Shown on the plan card." className="mt-4">
        <Textarea rows={4} value={form.features} onChange={setInput('features')} />
      </Field>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ['watermarkFreeExports', 'Watermark-free exports'],
          ['printQualityExports', 'Print-quality exports'],
          ['isActive', 'Active — can be assigned'],
          ['visibleToUsers', 'Show to users'],
        ].map(([field, label]) => (
          <div
            key={field}
            className="flex items-center justify-between gap-3 rounded-sm border border-hairline p-3"
          >
            <span className="text-xs font-semibold text-ink">{label}</span>
            <Switch label={label} checked={form[field]} onCheckedChange={set(field)} />
          </div>
        ))}
      </div>

      <Field label="Order" hint="Lower sorts first." className="mt-4 max-w-[160px]">
        <Input inputMode="numeric" value={form.sortOrder} onChange={setInput('sortOrder')} />
      </Field>
    </Modal>
  );
}

export default PlanForm;
