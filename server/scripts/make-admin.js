/**
 * Promotes an account to admin, by email.
 *
 * The first admin has to come from outside the app: `role` defaults to `user`,
 * the panel is admin-only, and the one screen that can grant the role is behind
 * that guard. Without this there is no way in at all.
 *
 * Run against a real database:  node scripts/make-admin.js you@example.com
 * Demote the same way:          node scripts/make-admin.js you@example.com user
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/index.js';
import { logger } from '../src/config/logger.js';

async function main() {
  const [email, role = 'admin'] = process.argv.slice(2);

  if (!email) {
    console.error('Usage: node scripts/make-admin.js <email> [admin|user]');
    process.exitCode = 1;
    return;
  }

  if (!['admin', 'user'].includes(role)) {
    console.error(`Unknown role "${role}". Use "admin" or "user".`);
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  const user = await User.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    { $set: { role } },
    { new: true, projection: { email: 1, role: 1, name: 1 } },
  );

  if (!user) {
    // Not an error worth a stack trace: the usual cause is a typo, or signing
    // up with a different address than the one being typed here.
    console.error(`No account found for ${email}. Sign up first, then run this.`);
    process.exitCode = 1;
  } else {
    // The logger is the record; this line is the answer the operator ran the
    // script for, so it goes to stderr with the other direct messages rather
    // than being buried in a JSON log line.
    console.error(`${user.name} <${user.email}> is now ${user.role}.`);
    logger.info({ email: user.email, role: user.role }, 'Role updated');
  }

  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error({ err }, 'Could not update the role');
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
