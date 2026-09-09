import { api } from './client.js';

/**
 * The plans an admin has chosen to show, plus the one this account is on.
 * Drafts and withdrawn plans never reach the browser.
 */
export const fetchPlans = () => api.get('/plans');

export default { fetchPlans };
