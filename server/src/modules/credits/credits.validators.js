import { z } from 'zod';

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * An admin adjustment. `amount` is signed — positive tops an account up,
 * negative corrects it down — and zero is rejected because it would write a
 * ledger row that says nothing happened.
 */
export const adjustCreditsSchema = z.object({
  amount: z
    .number()
    .int()
    .refine((value) => value !== 0, 'Enter a positive or negative number of credits'),
  reason: z.string().trim().max(200).default(''),
});

export default { historyQuerySchema, adjustCreditsSchema };
