import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../api/client.js';
import * as generationApi from '../../api/generation.js';
import { useAuthStore } from '../../store/authStore.js';

export const generationKeys = { progress: (bookId) => ['generation', 'book', bookId] };

/**
 * Drives illustrating a whole book.
 *
 * Progress is read from the pages themselves rather than tracked client-side —
 * a page can be settled by a provider callback this browser never saw, so the
 * server's view is the only one that can be right.
 */
export function useBookGeneration(bookId) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const progress = useQuery({
    queryKey: generationKeys.progress(bookId),
    queryFn: () => generationApi.fetchBookProgress(bookId),
    enabled: Boolean(bookId),
    /**
     * Keep polling while anything is still in flight — and, on a run, between
     * the stages too. Page counters go quiet while the cast is being drawn and
     * again while the cover is, so polling on those alone would stop dead in
     * the middle of a run and leave the screen frozen.
     */
    refetchInterval: (query) => {
      const data = query.state.data;
      const running = (data?.inFlight ?? 0) > 0 || Boolean(data?.autopilot?.isRunning);
      return running ? 2500 : false;
    },
    refetchIntervalInBackground: true,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: generationKeys.progress(bookId) });
    await useAuthStore.getState().refreshSession();
  }, [queryClient, bookId]);

  const describe = (err) => {
    if (!(err instanceof ApiClientError)) return 'Something went wrong. Please try again.';
    if (err.code === 'NOTHING_TO_GENERATE') return err.message;
    return err.message;
  };

  const startAll = useMutation({
    mutationFn: () => generationApi.generateBook(bookId),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err) => setError(describe(err)),
  });

  const retryPage = useMutation({
    mutationFn: (pageId) => generationApi.retryPage(bookId, pageId),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err) => setError(describe(err)),
  });

  const data = progress.data;
  const autopilot = data?.autopilot ?? { enabled: false, stage: null, isRunning: false, error: null };

  return {
    autopilot,
    characters: data?.characters ?? [],
    pages: data?.pages ?? [],
    total: data?.total ?? 0,
    ready: data?.ready ?? 0,
    failed: data?.failed ?? 0,
    pending: data?.pending ?? 0,
    inFlight: data?.inFlight ?? 0,
    percent: data?.percent ?? 0,
    isPending: progress.isPending,
    isError: progress.isError,
    refetch: progress.refetch,
    isRunning: (data?.inFlight ?? 0) > 0 || autopilot.isRunning,
    isComplete: Boolean(
      data &&
        data.total > 0 &&
        data.inFlight === 0 &&
        data.failed === 0 &&
        data.pending === 0 &&
        !autopilot.isRunning,
    ),
    startAll,
    retryPage,
    error,
    dismissError: () => setError(null),
  };
}

export default useBookGeneration;
