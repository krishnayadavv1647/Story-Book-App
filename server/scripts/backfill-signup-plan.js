/**
 * Puts accounts that signed up before the signup plan was live onto it — without
 * handing them its credits a second time.
 *
 * Until `SIGNUP_PLAN_KEY` was set on the server, new accounts opened on the flat
 * `CREDITS_SIGNUP_GRANT` instead of the plan. They already hold the same credits
 * the plan would have given them, so this only opens the subscription: their
 * Credits screen then says which plan they are on, like everyone after them.
 *
 * Only accounts that received a flat signup grant and are on no plan at all are
 * touched. Anyone already on a plan — the bonus or one an admin gave them — is
 * left alone, and so is an account from before the credit system that never
 * received a signup grant. Idempotent: a second run finds nobody.
 *
 *   node scripts/backfill-signup-plan.js            # uses SIGNUP_PLAN_KEY
 *   node scripts/backfill-signup-plan.js bonus      # or name the plan
 *   node scripts/backfill-signup-plan.js bonus --dry-run
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { CreditLedger, Plan, Subscription, User } from '../src/models/index.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { assignPlan } from '../src/modules/plans/plans.service.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const key = args.find((arg) => !arg.startsWith('--')) || env.SIGNUP_PLAN_KEY;

  if (!key) {
    console.error('Name a plan key, or set SIGNUP_PLAN_KEY.');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  const plan = await Plan.findOne({ key, isActive: true }).select('_id name key').lean();
  if (!plan) {
    console.error(`No active plan with key "${key}".`);
    process.exitCode = 1;
    await disconnectDatabase();
    return;
  }

  const onAPlan = await Subscription.distinct('userId', {
    status: { $in: ['trialing', 'active', 'past_due'] },
  });
  const flatGranted = await CreditLedger.distinct('userId', { type: 'signup_grant' });
  const onAPlanSet = new Set(onAPlan.map(String));

  const targets = await User.find({
    _id: { $in: flatGranted.filter((id) => !onAPlanSet.has(String(id))) },
  })
    .select('_id email')
    .lean();

  console.error(
    `${targets.length} account(s) opened on the flat grant and are on no plan.` +
      (dryRun ? ' Dry run — nothing changed.' : ''),
  );

  let done = 0;
  if (!dryRun) {
    for (const user of targets) {
      await assignPlan({ userId: user._id, planId: plan._id, actor: null, grantCredits: false });
      done += 1;
    }
  }

  logger.info({ plan: plan.key, assigned: done, dryRun }, 'Signup plan backfill finished');
  console.error(dryRun ? 'Nothing assigned.' : `Put ${done} account(s) on "${plan.name}".`);

  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error({ err }, 'Signup plan backfill failed');
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
