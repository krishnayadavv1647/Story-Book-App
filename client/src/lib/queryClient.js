import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client.js';

export function createQueryClient() {
  const client = new QueryClient({
    /**
     * Any mutation might have spent credits — planning a story, illustrating a
     * page, rewriting one. Invalidating the balance here rather than at each of
     * those call sites means the sidebar cannot drift out of date because the
     * next paid action forgot to say so.
     */
    mutationCache: new MutationCache({
      onSuccess: () => client.invalidateQueries({ queryKey: ['credits'] }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry(failureCount, error) {
          // Retrying an auth, permission, validation or payment failure just
          // burns time — the answer will not change.
          if (error instanceof ApiClientError) {
            if ([400, 401, 402, 403, 404, 422].includes(error.status)) return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        // Mutations here can start real work; a blind retry could double it.
        // Retries belong on the server behind an idempotency key.
        retry: false,
      },
    },
  });

  return client;
}

export const queryClient = createQueryClient();
export default queryClient;
