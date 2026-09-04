/**
 * Backfills `BookPage.type` on books created before the field existed.
 *
 * Safe and idempotent: it only touches pages with no `type` at all, and sets
 * them to `story` — which is what they are, and what the code already assumes
 * for a missing value (`page.type ?? 'story'`). So running it changes nothing
 * about behaviour; it just makes the stored data match, and re-running it is a
 * no-op. It never adds, removes or reorders pages, so existing books are not
 * modified beyond stamping the type.
 *
 * Run once against a real database:  node scripts/backfill-page-types.js
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { BookPage } from '../src/models/index.js';
import { logger } from '../src/config/logger.js';

async function main() {
  await connectDatabase();

  const missing = await BookPage.countDocuments({ type: { $exists: false } });
  logger.info({ missing }, 'Pages without a type');

  if (missing > 0) {
    const result = await BookPage.updateMany(
      { type: { $exists: false } },
      { $set: { type: 'story' } },
    );
    logger.info({ modified: result.modifiedCount }, 'Backfilled page types');
  }

  await disconnectDatabase();
}

main().catch(async (err) => {
  logger.error({ err }, 'Page-type backfill failed');
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
