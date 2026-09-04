import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiClientError } from '../../api/client.js';
import * as booksApi from '../../api/books.js';

export const bookKeys = { list: (filters) => ['books', 'list', filters] };

/** The account's books, optionally narrowed to one status. */
export function useBooks({ status, limit = 48 } = {}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const query = useQuery({
    queryKey: bookKeys.list({ status, limit }),
    queryFn: () => booksApi.listBooks({ status, limit }),
  });

  const remove = useMutation({
    mutationFn: booksApi.deleteBook,
    onMutate: () => setError(null),
    // Every list and count in the app is now one book out of date, and they all
    // hang off the same root key.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['books'] }),
    onError: (err) =>
      setError(
        err instanceof ApiClientError ? err.message : 'That book could not be deleted.',
      ),
  });

  return {
    items: query.data?.items ?? [],
    pagination: query.data?.pagination ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    remove,
    error,
    dismissError: () => setError(null),
  };
}

export default useBooks;
