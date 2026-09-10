import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import * as service from './bonusLinks.service.js';

/** Admin: every link, newest first, with the plan it grants and how often it has. */
export const list = asyncHandler(async (_req, res) =>
  sendSuccess(res, { data: await service.listLinks(), message: 'Bonus links' }),
);

export const create = asyncHandler(async (req, res) =>
  sendCreated(res, {
    data: await service.createLink({ ...req.validated.body, actor: req.user }),
    message: 'Bonus link created',
  }),
);

export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.updateLink({
      linkId: req.validated.params.linkId,
      patch: req.validated.body,
      actor: req.user,
    }),
    message: 'Bonus link updated',
  }),
);

export default { list, create, update };
