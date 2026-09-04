import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import * as generationApi from '../../api/generation.js';
import { useAuthStore } from '../../store/authStore.js';

export const coverKeys = { detail: (bookId) => ['generation', 'cover', bookId] };

/**
 * The book's front cover.
 *
 * Kept apart from `useBookGeneration` because the two have different lifetimes:
 * pages are illustrated once, a cover is redrawn whenever the title changes or
 * the author simply wants another one.
 */
export function useBookCover(bookId) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const query = useQuery({
    queryKey: coverKeys.detail(bookId),
    queryFn: () => generationApi.fetchBookCover(bookId),
    enabled: Boolean(bookId),
    // The provider may settle this job through a callback this browser never
    // sees, so the server's view is the only one that can be right.
    refetchInterval: (q) => (q.state.data?.inFlight ? 2500 : false),
    refetchIntervalInBackground: true,
  });

  const data = query.data;
  const inFlight = Boolean(data?.inFlight);

  // The library reads the cover off the book record, so it is stale the moment
  // one lands. Invalidate on the falling edge only — invalidating every poll
  // would refetch the whole library every 2.5s while a cover generates.
  const wasInFlight = useRef(false);
  useEffect(() => {
    if (wasInFlight.current && !inFlight) {
      queryClient.invalidateQueries({ queryKey: ['books'] });
    }
    wasInFlight.current = inFlight;
  }, [inFlight, queryClient]);

  const describe = (err) => {
    if (!(err instanceof ApiClientError)) return 'Something went wrong. Please try again.';
    return err.message;
  };

  const generate = useMutation({
    mutationFn: () => generationApi.generateBookCover(bookId),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: coverKeys.detail(bookId) });
      await useAuthStore.getState().refreshSession();
    },
    onError: (err) => setError(describe(err)),
  });

  return {
    title: data?.title ?? '',
    subtitle: data?.subtitle ?? '',
    coverUrl: data?.coverUrl ?? null,
    // `page` means a page illustration is standing in — artwork with no title
    // lettered into it.
    source: data?.source ?? null,
    isGenerated: Boolean(data?.isGenerated),
    inFlight,
    jobError: data?.job?.error ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    generate,
    error,
    dismissError: () => setError(null),
  };
}

export default useBookCover;
