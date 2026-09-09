import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import * as service from './plans.service.js';

/**
 * What a reader sees: the plans an admin has chosen to show, and the one this
 * account is on. Hidden and withdrawn plans never appear here.
 */
export const listVisible = asyncHandler(async (req, res) => {
  const [plans, current] = await Promise.all([
    service.listPlans(),
    service.currentSubscription(req.user._id),
  ]);

  return sendSuccess(res, { data: { plans, current }, message: 'Plans' });
});

/* ---------------------------------------------------------------- admin --- */

export const listAll = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: await service.listPlans({ includeHidden: true }),
    message: 'Plans',
  }),
);

export const create = asyncHandler(async (req, res) =>
  sendCreated(res, {
    data: await service.createPlan(req.validated.body, req.user),
    message: 'Plan created',
  }),
);

export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.updatePlan(req.validated.params.planId, req.validated.body, req.user),
    message: 'Plan updated',
  }),
);

export const remove = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.removePlan(req.validated.params.planId, req.user),
    message: 'Plan withdrawn',
  }),
);

export const assign = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.assignPlan({
      userId: req.validated.params.userId,
      planId: req.validated.body.planId,
      actor: req.user,
    }),
    message: 'Plan assigned',
  }),
);

export const cancel = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.cancelSubscription(req.validated.params.userId, req.user),
    message: 'Plan cancelled',
  }),
);

export default { listVisible, listAll, create, update, remove, assign, cancel };
