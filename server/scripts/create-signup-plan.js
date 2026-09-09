/**
 * Creates (or updates) the plan every new account is put on.
 *
 * `SIGNUP_PLAN_KEY` names a plan by key, so the plan has to exist before the
 * first signup — otherwise the account is created, the signup works, and the
 * credits silently are not granted (the service logs a warning and carries on,
 * because failing a registration over a missing plan would be worse).
 *
 * Idempotent: run it again to change the credits or the copy. It is also all
 * editable in the admin panel, which is the easier place once the app is up.
 *
 *   node scripts/create-signup-plan.js
 *   node scripts/create-signup-plan.js bonus "Welcome Bonus" 500
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Plan } from '../src/models/index.js';
import { logger } from '../src/config/logger.js';

async function main() {
  const [key = 'bonus', name = 'Welcome Bonus', credits = '500'] = process.argv.slice(2);
  const creditsGranted = Number(credits);

  if (!Number.isInteger(creditsGranted) || creditsGranted < 0) {
    console.error('Credits must be a whole number.');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  const plan = await Plan.findOneAndUpdate(
    { key },
    {
      $set: {
        name,
        description: 'Everything you need to make your first books.',
        // A bonus is not sold, so it carries no price. Zero renders as "Free",
        // which is what it is to the person holding it.
        priceCents: 0,
        currency: 'USD',
        interval: 'lifetime',
        creditsGranted,
        features: [`${creditsGranted} credits to start`, 'Included free'],
        isActive: true,
        // Shown to readers, so a new account can see what it was given.
        visibleToUsers: true,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  logger.info({ key: plan.key, creditsGranted: plan.creditsGranted }, 'Signup plan ready');
  console.error(
    `Plan "${plan.name}" (key: ${plan.key}) grants ${plan.creditsGranted} credits.\n` +
      `Set SIGNUP_PLAN_KEY=${plan.key} in server/.env, and CREDITS_SIGNUP_GRANT=0 so the\n` +
      'plan is the only thing a new account opens with.',
  );

  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error({ err }, 'Could not create the signup plan');
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
