import mongoose from 'mongoose';
import { SUBSCRIPTION_STATUS } from './enums.js';

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUS, default: 'active', index: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    // Opaque identifiers from whichever billing provider is wired up later.
    externalCustomerId: { type: String, default: null },
    externalSubscriptionId: { type: String, default: null },
  },
  { timestamps: true },
);

// A user holds at most one non-terminal subscription at a time.
subscriptionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['trialing', 'active', 'past_due'] } } },
);
// Partial, not sparse — the field defaults to null and sparse would still index
// (and therefore collide on) every subscription without a billing provider id.
subscriptionSchema.index(
  { externalSubscriptionId: 1 },
  { unique: true, partialFilterExpression: { externalSubscriptionId: { $type: 'string' } } },
);
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export default Subscription;
