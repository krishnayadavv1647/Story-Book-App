import mongoose from 'mongoose';

/**
 * A shareable sign-up link that puts whoever comes through it on a plan.
 *
 * The code is the whole of the access control: anyone holding the link can use
 * it, so it is long and random rather than a readable word, and an admin can
 * switch a link off the moment it turns up somewhere it should not be.
 *
 * `uses` counts VERIFIED sign-ups, not form submissions. A link is spent when
 * somebody proves their address and receives the plan — counting unverified
 * attempts would let a script inflate a campaign's numbers without a single
 * real reader behind them.
 */
const bonusLinkSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    // What the admin calls it — "Cinema Studio buyers", "September promo".
    label: { type: String, required: true, trim: true, maxlength: 80 },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    isActive: { type: Boolean, default: true },
    uses: { type: Number, default: 0, min: 0 },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

bonusLinkSchema.index({ code: 1 }, { unique: true });
bonusLinkSchema.index({ createdAt: -1 });

export const BonusLink = mongoose.model('BonusLink', bonusLinkSchema);
export default BonusLink;
