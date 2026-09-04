import { api } from './client.js';

export const fetchOverview = () => api.get('/admin/overview');
export const listUsers = ({ search, limit = 25 } = {}) =>
  api.list('/admin/users', { query: { search: search || undefined, limit } });
export const fetchAudit = () => api.get('/admin/audit');

export default { fetchOverview, listUsers, fetchAudit };
