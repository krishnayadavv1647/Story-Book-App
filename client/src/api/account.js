import { api } from './client.js';

export const fetchNotifications = ({ unreadOnly = false, limit = 25 } = {}) =>
  api.list('/notifications', { query: { unreadOnly, limit } });
export const markNotificationRead = (id) => api.post(`/notifications/${id}/read`, {});
export const markAllNotificationsRead = () => api.post('/notifications/read-all', {});

export const fetchProfile = () => api.get('/users/me');
export const updateProfile = (patch) => api.patch('/users/me', patch);
export const changePassword = (body) => api.post('/users/me/password', body);
// BYOK: set or clear the user's own provider keys. `{ gemini?, kie? }`; an empty
// string clears that key.
export const setApiKeys = (body) => api.put('/users/me/api-keys', body);

export default {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  fetchProfile,
  updateProfile,
  changePassword,
  setApiKeys,
};
