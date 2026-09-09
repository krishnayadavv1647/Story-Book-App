import { useQuery } from '@tanstack/react-query';

import * as creditsApi from '../../api/credits.js';

export const creditKeys = {
  balance: () => ['credits', 'balance'],
  history: (page) => ['credits', 'history', page],
};

/**
 * The balance shown in the sidebar and on the credits screen.
 *
 * Nothing here refetches on a timer: every successful mutation invalidates the
 * balance (see `createQueryClient`), which is exactly when it can have changed.
 */
export function useCredits() {
  const query = useQuery({
    queryKey: creditKeys.balance(),
    queryFn: creditsApi.fetchCredits,
  });

  return {
    balance: query.data?.balance ?? null,
    prices: query.data?.prices ?? {},
    recent: query.data?.recent ?? [],
    signupGrant: query.data?.signupGrant ?? null,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCreditHistory({ page = 1, limit = 25 } = {}) {
  const query = useQuery({
    queryKey: creditKeys.history(page),
    queryFn: () => creditsApi.fetchCreditHistory({ page, limit }),
    placeholderData: (previous) => previous,
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    // The server echoes back the page size it actually applied; trusting that
    // over the number we asked for keeps the pager honest if it ever clamps.
    page: query.data?.page ?? page,
    limit: query.data?.limit ?? limit,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export default { useCredits, useCreditHistory, creditKeys };
