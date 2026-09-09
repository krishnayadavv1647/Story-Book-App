/**
 * Gives accounts created before the credit system their opening balance.
 *
 * This one is not cosmetic. Spending is a conditional update — `credits: {
 * $gte: amount }` — and that condition can never match a document where the
 * field is absent, so an account from before the field existed cannot generate
 * anything until it is filled in. (Mongoose applies the schema default when it
 * hydrates such a document, which makes the balance *look* right on screen
 * while every charge is refused. The stored data has to actually change.)
 *
 * Safe and idempotent: only accounts with no `credits` field at all are
 * touched, so re-running it does nothing and an account that has already spent
 * some is never topped back up. Each one also gets the same `signup_grant`
 * ledger row a new account gets, keeping the invariant that an account's rows
 * sum to its balance.
 *
 * Run once against a real database:  node scripts/backfill-credits.js
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { CreditLedger, User } from '../src/models/index.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';

async function main() {
  await connectDatabase();

  const filter = { credits: { $exists: false } };
  const accounts = await User.find(filter).select('_id').lean();
  logger.info({ accounts: accounts.length }, 'Accounts without a credit balance');

  if (accounts.length === 0) {
    await disconnectDatabase();
    return;
  }

  const result = await User.updateMany(filter, {
    $set: { credits: env.CREDITS_SIGNUP_GRANT },
  });

  // `ordered: false` so one account that already has its row — a half-finished
  // earlier run — does not stop the rest. The unique index on `idempotencyKey`
  // is what makes that duplicate harmless.
  const rows = accounts.map(({ _id }) => ({
    userId: _id,
    amount: env.CREDITS_SIGNUP_GRANT,
    balanceAfter: env.CREDITS_SIGNUP_GRANT,
    type: 'signup_grant',
    reason: 'Opening balance',
    idempotencyKey: `signup:${_id}`,
  }));

  try {
    await CreditLedger.insertMany(rows, { ordered: false });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    logger.info('Some ledger rows already existed and were skipped');
  }

  logger.info({ modified: result.modifiedCount }, 'Backfilled credit balances');
  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error({ err }, 'Credit backfill failed');
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
