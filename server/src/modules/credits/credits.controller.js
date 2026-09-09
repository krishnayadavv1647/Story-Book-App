import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { CREDIT_PRICES } from './pricing.js';
import * as service from './credits.service.js';

export const balance = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: { ...(await service.summary(req.user._id)), prices: CREDIT_PRICES },
    message: 'Credit balance',
  }),
);

export const history = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.history({ userId: req.user._id, ...req.validated.query }),
    message: 'Credit history',
  }),
);

export default { balance, history };
