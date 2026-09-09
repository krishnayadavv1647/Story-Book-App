import mongoose from 'mongoose';
import { CREDIT_ENTRY_TYPES } from './enums.js';

/**
 * Every movement of a user's credit balance, append-only.
 *
 * `User.credits` is the running total and the only thing read on the hot path;
 * this collection is the story of how it got there. Nothing edits a row once it
 * is written — a mistake is corrected by adding an opposing row, the way a
 * ledger works, so the history can always be replayed.
 *
 * `balanceAfter` is denormalised deliberately: it is what the account screen
 * shows beside each line, and recomputing it by summing every earlier row would
 * turn one page of history into a full-collection scan.
 *
 * INVARIANT. An account's balance equals the sum of its rows. New accounts get
 * their opening `signup_grant` row written the moment they are created, so the
 * sum holds from the first request onwards.
 */
const creditLedgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Signed: negative for a debit, positive for a grant or refund. Storing the
    // sign rather than a separate direction field means the balance is a plain
    // sum and can never disagree with itself.
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },

    type: { type: String, enum: CREDIT_ENTRY_TYPES, required: true },
    // Shown to the user as-is, so it reads as a sentence, not a code.
    reason: { type: String, default: '', maxlength: 200 },

    /**
     * Makes a write happen at most once. A poll and a provider callback can
     * settle the same failed job at the same instant; both would refund it.
     * The unique index below turns the second write into a duplicate-key error
     * the service swallows, which is cheaper and more honest than a lock.
     */
    idempotencyKey: { type: String, default: null },

    refs: {
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'GenerationJob', default: null },
      bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null },
      pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookPage', default: null },
      characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', default: null },
    },

    // The admin who moved the balance by hand. Null for everything the system
    // did on its own.
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// The account history screen, newest first.
creditLedgerSchema.index({ userId: 1, createdAt: -1 });
// Partial, not sparse: the field defaults to null, and a sparse unique index
// would still index every null and collide on the second row that has none.
creditLedgerSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
creditLedgerSchema.index(
  { 'refs.jobId': 1 },
  { partialFilterExpression: { 'refs.jobId': { $type: 'objectId' } } },
);

export const CreditLedger = mongoose.model('CreditLedger', creditLedgerSchema);
export default CreditLedger;
