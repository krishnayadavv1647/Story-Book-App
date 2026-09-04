import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendPaginated, sendSuccess } from '../../utils/apiResponse.js';
import * as service from './notifications.service.js';

export const list = asyncHandler(async (req, res) => {
  const { unreadOnly, page, limit } = req.validated.query;
  const { items, total, unread } = await service.listNotifications({
    userId: req.user._id,
    unreadOnly,
    page,
    limit,
  });

  return sendPaginated(res, { items, page, limit, total, message: 'Notifications', meta: { unread } });
});

export const read = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    data: await service.markRead({
      userId: req.user._id,
      notificationId: req.validated.params.notificationId,
    }),
    message: 'Marked read',
  }),
);

export const readAll = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: await service.markAllRead(req.user._id), message: 'All marked read' }),
);

export default { list, read, readAll };
