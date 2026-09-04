import { api } from './client.js';

export const fetchBookDetail = (bookId) => api.get(`/books/${bookId}`);

export const updateBook = (bookId, patch) => api.patch(`/books/${bookId}`, patch);

export const updatePage = (bookId, pageId, patch) =>
  api.patch(`/books/${bookId}/pages/${pageId}`, patch);

export const addPage = (bookId, body = {}) => api.post(`/books/${bookId}/pages`, body);

export const duplicatePage = (bookId, pageId) =>
  api.post(`/books/${bookId}/pages/${pageId}/duplicate`, {});

export const deletePage = (bookId, pageId) => api.delete(`/books/${bookId}/pages/${pageId}`);

/** Points a page at an image the user uploaded. Ownership is checked server-side. */
export const setPageArtwork = (bookId, pageId, assetId) =>
  api.post(`/books/${bookId}/pages/${pageId}/artwork`, { assetId });

/** Asks the server to choose a layout from what the page actually holds. */
export const magicLayout = (bookId, pageId) =>
  api.post(`/books/${bookId}/pages/${pageId}/magic-layout`, {});

/** Calls the model and keeps the old text as a revision. */
export const rewritePage = (bookId, pageId, instruction) =>
  api.post(`/books/${bookId}/pages/${pageId}/rewrite`, instruction ? { instruction } : {});

/** The complete page order — a partial list is rejected by the server. */
export const reorderPages = (bookId, order) =>
  api.patch(`/books/${bookId}/pages/reorder`, { order });

export default {
  fetchBookDetail,
  updateBook,
  updatePage,
  addPage,
  duplicatePage,
  deletePage,
  reorderPages,
  magicLayout,
  rewritePage,
  setPageArtwork,
};
