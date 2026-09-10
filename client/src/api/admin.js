import { api } from './client.js';

export const fetchOverview = () => api.get('/admin/overview');
export const listUsers = ({ search, page = 1, limit = 25 } = {}) =>
  api.list('/admin/users', { query: { search: search || undefined, page, limit } });
export const fetchUserDetail = (userId) => api.get(`/admin/users/${userId}`);
export const fetchAudit = () => api.get('/admin/audit');

/** Suspend, reactivate, promote, demote. Refused on your own account. */
export const updateUser = (userId, patch) => api.patch(`/admin/users/${userId}`, patch);

/**
 * Moves one account's balance. `amount` is signed — positive tops up, negative
 * corrects down — and this is the only way credits are handed out after signup.
 */
export const adjustUserCredits = (userId, { amount, reason = '' }) =>
  api.post(`/admin/users/${userId}/credits`, { amount, reason });

/* ------------------------------------------------------------------ plans -- */

/** Every plan, including drafts nobody can see yet. */
export const listPlans = () => api.get('/admin/plans');
export const createPlan = (body) => api.post('/admin/plans', body);
export const updatePlan = (planId, patch) => api.patch(`/admin/plans/${planId}`, patch);
export const deletePlan = (planId) => api.delete(`/admin/plans/${planId}`);

/** Putting an account on a plan is what hands over the plan's credits. */
export const assignPlan = (userId, planId) => api.post(`/admin/users/${userId}/plan`, { planId });
export const cancelPlan = (userId) => api.delete(`/admin/users/${userId}/plan`);

/* ------------------------------------------------------------ bonus links -- */

export const listBonusLinks = () => api.get('/admin/bonus-links');
export const createBonusLink = (body) => api.post('/admin/bonus-links', body);
export const updateBonusLink = (linkId, patch) => api.patch(`/admin/bonus-links/${linkId}`, patch);

export default {
  listBonusLinks,
  createBonusLink,
  updateBonusLink,
  fetchOverview,
  listUsers,
  fetchUserDetail,
  fetchAudit,
  updateUser,
  adjustUserCredits,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  assignPlan,
  cancelPlan,
};
