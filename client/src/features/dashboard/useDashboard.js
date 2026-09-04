import { useQuery } from '@tanstack/react-query';
import { fetchLibrarySummary, listBooks } from '../../api/books.js';

/** Query keys in one place so a mutation can invalidate precisely. */
export const dashboardKeys = {
  books: (params) => ['books', params],
  summary: () => ['books', 'summary'],
};

export function useRecentBooks({ limit = 6 } = {}) {
  return useQuery({
    queryKey: dashboardKeys.books({ limit, sort: 'recent' }),
    queryFn: () => listBooks({ limit, sort: 'recent' }),
  });
}

export function useLibrarySummary() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: fetchLibrarySummary,
  });
}

export default { useRecentBooks, useLibrarySummary, dashboardKeys };
