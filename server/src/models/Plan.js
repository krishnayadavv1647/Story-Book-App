import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true, maxlength: 3 },
    interval: { type: String, enum: ['month', 'year', 'lifetime'], default: 'month' },

    /**
     * The credits assigning this plan hands over.
     *
     * This is what makes a plan do something today: there is no payment
     * provider, so `priceCents` is a label, and the credits are the substance.
     */
    creditsGranted: { type: Number, default: 0, min: 0 },

    /**
     * Whether readers see this plan at all.
     *
     * Off by default so a plan can be drafted, priced and corrected without
     * anybody watching, and shown only when it is ready. `isActive` is a
     * different question — an active plan can still be admin-only, and a plan
     * withdrawn from sale stays readable on the accounts that hold it.
     */
    visibleToUsers: { type: Boolean, default: false },
    limits: {
      maxBooks: { type: Number, default: null },
      maxPagesPerBook: { type: Number, default: 40 },
      maxCharacters: { type: Number, default: null },
      maxExportsPerMonth: { type: Number, default: null },
      watermarkFreeExports: { type: Boolean, default: false },
      printQualityExports: { type: Boolean, default: false },
    },
    features: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

planSchema.index({ key: 1 }, { unique: true });
planSchema.index({ isActive: 1, sortOrder: 1 });
planSchema.index({ visibleToUsers: 1, isActive: 1, sortOrder: 1 });

export const Plan = mongoose.model('Plan', planSchema);
export default Plan;
