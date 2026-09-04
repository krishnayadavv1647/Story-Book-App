import { api } from './client.js';

/** What the preview screen needs before anything is spent. */
export const fetchExportOptions = (bookId) => api.get(`/books/${bookId}/export/options`);

export const createExport = (bookId, body) => api.post(`/books/${bookId}/export`, body);

export const fetchExport = (jobId) => api.get(`/exports/${jobId}`);

export const listExports = (bookId) => api.get('/exports', { query: { bookId } });

export const setPublished = (bookId, published) =>
  api.post(`/books/${bookId}/publish`, { published });

/** The automatic print-quality report — read-only, safe to poll. */
export const fetchPrintCheck = (bookId) => api.get(`/books/${bookId}/print-check`);

/** Adds any missing title/ending pages to an older book (idempotent). */
export const preparePrint = (bookId) => api.post(`/books/${bookId}/pages/prepare-print`, {});

export default {
  fetchExportOptions,
  createExport,
  fetchExport,
  listExports,
  setPublished,
  fetchPrintCheck,
  preparePrint,
};
