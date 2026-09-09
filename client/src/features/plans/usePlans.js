import { useQuery } from '@tanstack/react-query';

import * as plansApi from '../../api/plans.js';

export const planKeys = { visible: () => ['plans', 'visible'] };

/**
 * What this account is on, and what else is offered.
 *
 * Both come from one request: a plan card is only worth showing next to the
 * plan the reader already has, and asking twice would let the two disagree on
 * screen.
 */
export function usePlans() {
  const query = useQuery({ queryKey: planKeys.visible(), queryFn: plansApi.fetchPlans });

  return {
    plans: query.data?.plans ?? [],
    current: query.data?.current ?? null,
    isPending: query.isPending,
    isError: query.isError,
  };
}

export default usePlans;
