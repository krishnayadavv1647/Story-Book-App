import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client.js';

export function createQueryClient() {
  return new QueryClient({
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
}

export const queryClient = createQueryClient();
export default queryClient;
