import { api, apiRequest } from './client.js';

export const requestCharacterImage = (characterId, { pose = 'front' } = {}) =>
  api.post(`/generation/characters/${characterId}/image`, { pose });

export const requestCharacterSheet = (characterId) =>
  api.post(`/generation/characters/${characterId}/sheet`, {});

export const fetchJob = (jobId) => api.get(`/generation/jobs/${jobId}`);

export const cancelJob = (jobId) => api.post(`/generation/jobs/${jobId}/cancel`, {});

export const generateBook = (bookId) => api.post(`/generation/books/${bookId}/images`, {});

/**
 * The one-shot run: cast, pages and cover in order, with nobody pressing the
 * buttons between them. The only thing it needs is how the cast should be drawn.
 */
export const startAutopilot = (bookId, { characterImages = 'generate', referenceAssetIds = [] } = {}) =>
  api.post(`/generation/books/${bookId}/autopilot`, { characterImages, referenceAssetIds });

export const fetchBookProgress = (bookId) => api.get(`/generation/books/${bookId}/progress`);

/**
 * The book's front cover. Unlike a page image this one carries text: the server
 * letters the title and subtitle into the artwork, which is what the library
 * card shows instead of a printed caption.
 */
export const fetchBookCover = (bookId) => api.get(`/generation/books/${bookId}/cover`);

export const generateBookCover = (bookId) => api.post(`/generation/books/${bookId}/cover`, {});

export const retryPage = (bookId, pageId) =>
  api.post(`/generation/books/${bookId}/pages/${pageId}/image`, {});

/**
 * Uploads go through `fetch` directly rather than the JSON client: a multipart
 * body must not have its Content-Type set by hand, or the boundary is lost.
 */
export async function uploadReferenceImage(file) {
  const body = new FormData();
  body.append('file', file);

  return apiRequest('/media/upload', { method: 'POST', body, isMultipart: true });
}

export default {
  requestCharacterImage,
  requestCharacterSheet,
  fetchJob,
  cancelJob,
  generateBook,
  startAutopilot,
  fetchBookProgress,
  fetchBookCover,
  generateBookCover,
  retryPage,
  uploadReferenceImage,
};
