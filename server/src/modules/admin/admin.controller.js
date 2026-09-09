import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse.js';
import * as service from './admin.service.js';

export const overview = asyncHandler(async (_req, res) =>
  sendSuccess(res, { data: await service.overview(), message: 'Overview' }),
);

export const users = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.validated.query;
  const { items, total } = await service.listUsers({ page, limit, search });
  return sendPaginated(res, { items, page, limit, total, message: 'Users' });
});

export const adjustCredits = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.adjustUserCredits({
      userId: req.validated.params.userId,
      actorId: req.user._id,
      ...req.validated.body,
    }),
    message: 'Credits adjusted',
  }),
);

export const audit = asyncHandler(async (_req, res) =>
  sendSuccess(res, { data: await service.auditTrail({}), message: 'Audit trail' }),
);

export default { overview, users, adjustCredits, audit };
