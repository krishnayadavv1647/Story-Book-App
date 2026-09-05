import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './users.service.js';

export const me = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: await service.getProfile(req.user._id), message: 'Account' }),
);

export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.updateProfile({ user: req.user, patch: req.validated.body }),
    message: 'Account updated',
  }),
);

export const changePassword = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.changePassword({ user: req.user, ...req.validated.body }),
    message: 'Password changed',
  }),
);

export const setApiKeys = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.setApiKeys({ user: req.user, patch: req.validated.body }),
    message: 'API keys updated',
  }),
);

export default { me, update, changePassword, setApiKeys };
