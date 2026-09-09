import { api } from './client.js';

export const fetchOverview = () => api.get('/admin/overview');
export const listUsers = ({ search, limit = 25 } = {}) =>
  api.list('/admin/users', { query: { search: search || undefined, limit } });
export const fetchAudit = () => api.get('/admin/audit');

/**
 * Moves one account's balance. `amount` is signed — positive tops up, negative
 * corrects down — and this is the only way credits are handed out after signup.
 */
export const adjustUserCredits = (userId, { amount, reason = '' }) =>
  api.post(`/admin/users/${userId}/credits`, { amount, reason });

export default { fetchOverview, listUsers, fetchAudit, adjustUserCredits };
