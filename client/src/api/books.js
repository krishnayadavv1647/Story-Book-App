import { api } from './client.js';

export function listBooks({ page = 1, limit = 12, status, sort = 'recent' } = {}) {
  return api.list('/books', { query: { page, limit, status, sort } });
}

export function fetchLibrarySummary() {
  return api.get('/books/summary');
}

/** Patches a book's metadata — title, author, or print settings. */
export function updateBook(bookId, patch) {
  return api.patch(`/books/${bookId}`, patch);
}

/**
 * Irreversible. The book, its pages and the jobs that made them go; the cast
 * does not, because characters are account-wide and reusable.
 */
export function deleteBook(bookId) {
  return api.delete(`/books/${bookId}`);
}

export default { listBooks, fetchLibrarySummary, updateBook, deleteBook };
