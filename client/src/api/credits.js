import { api } from './client.js';

/** The balance, what each kind of work costs, and the last few movements. */
export const fetchCredits = () => api.get('/credits');

/** One page of the ledger, newest first. */
export const fetchCreditHistory = ({ page = 1, limit = 25 } = {}) =>
  api.get('/credits/history', { query: { page, limit } });

export default { fetchCredits, fetchCreditHistory };
