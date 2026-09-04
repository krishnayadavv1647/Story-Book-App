import { Notification } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Records something worth telling the user about.
 *
 * Called from the places that finish work — an illustration landing, an export
 * failing — so the bell reflects what actually happened rather than what the
 * browser happened to be watching at the time.
 */
export async function notify({ userId, type, title, body = '', actionPath = null, severity = 'info', refs = {} }) {
  return Notification.create({ userId, type, title, body, actionPath, severity, refs });
}

export async function listNotifications({ userId, unreadOnly = false, page = 1, limit = 25 }) {
  const filter = { userId };
  if (unreadOnly) filter.readAt = null;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, readAt: null }),
  ]);

  return { items, total, unread };
}

export async function markRead({ userId, notificationId }) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  );

  // Already read is not an error — the user's intent is satisfied either way.
  if (!notification) {
    const exists = await Notification.findOne({ _id: notificationId, userId });
    if (!exists) throw ApiError.notFound('Notification not found');
    return exists;
  }

  return notification;
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );

  return { updated: result.modifiedCount ?? 0 };
}

export default { notify, listNotifications, markRead, markAllRead };
