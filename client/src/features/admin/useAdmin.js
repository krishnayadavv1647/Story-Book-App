import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '../../api/admin.js';

export const adminKeys = {
  overview: () => ['admin', 'overview'],
  users: (search, page) => ['admin', 'users', search, page],
  user: (userId) => ['admin', 'user', userId],
  plans: () => ['admin', 'plans'],
  bonusLinks: () => ['admin', 'bonus-links'],
  audit: () => ['admin', 'audit'],
};

/** The admin screen's data. Every request here is refused for a non-admin. */
export function useAdmin() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const overview = useQuery({ queryKey: adminKeys.overview(), queryFn: adminApi.fetchOverview });
  const users = useQuery({
    queryKey: adminKeys.users(search, page),
    queryFn: () => adminApi.listUsers({ search, page }),
    // Keeps the current page on screen while the next one loads, instead of
    // blanking the table on every keystroke in the search box.
    placeholderData: (previous) => previous,
  });
  const plans = useQuery({ queryKey: adminKeys.plans(), queryFn: adminApi.listPlans });
  const bonusLinks = useQuery({
    queryKey: adminKeys.bonusLinks(),
    queryFn: adminApi.listBonusLinks,
  });
  const audit = useQuery({ queryKey: adminKeys.audit(), queryFn: adminApi.fetchAudit });

  /**
   * Anything that changes an account can change its balance, its plan and the
   * audit trail at once, so every one of these invalidates the lot rather than
   * trying to predict which panel went stale.
   */
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const adjustCredits = useMutation({
    mutationFn: ({ userId, amount, reason }) =>
      adminApi.adjustUserCredits(userId, { amount, reason }),
    onSuccess: refreshAll,
  });

  const updateUser = useMutation({
    mutationFn: ({ userId, patch }) => adminApi.updateUser(userId, patch),
    onSuccess: refreshAll,
  });

  const assignPlan = useMutation({
    mutationFn: ({ userId, planId }) => adminApi.assignPlan(userId, planId),
    onSuccess: refreshAll,
  });

  const cancelPlan = useMutation({
    mutationFn: ({ userId }) => adminApi.cancelPlan(userId),
    onSuccess: refreshAll,
  });

  const createPlan = useMutation({ mutationFn: adminApi.createPlan, onSuccess: refreshAll });
  const updatePlan = useMutation({
    mutationFn: ({ planId, patch }) => adminApi.updatePlan(planId, patch),
    onSuccess: refreshAll,
  });
  const deletePlan = useMutation({
    mutationFn: ({ planId }) => adminApi.deletePlan(planId),
    onSuccess: refreshAll,
  });

  const createBonusLink = useMutation({
    mutationFn: adminApi.createBonusLink,
    onSuccess: refreshAll,
  });
  const updateBonusLink = useMutation({
    mutationFn: ({ linkId, patch }) => adminApi.updateBonusLink(linkId, patch),
    onSuccess: refreshAll,
  });

  const pagination = users.data?.pagination ?? null;

  return {
    overview: overview.data ?? null,
    users: users.data?.items ?? [],
    plans: plans.data ?? [],
    // Guarded, not just defaulted: anything that is not a list must not reach a
    // `.map` and take the whole Plans tab down with it.
    bonusLinks: Array.isArray(bonusLinks.data) ? bonusLinks.data : [],
    audit: audit.data ?? [],
    search,
    setSearch: (value) => {
      // A new search starts at the beginning; staying on page 4 of the old
      // result set shows an empty table and looks like a bug.
      setPage(1);
      setSearch(value);
    },
    page,
    setPage,
    totalUsers: pagination?.total ?? 0,
    totalPages: pagination?.totalPages ?? 1,
    isPending: overview.isPending || users.isPending,
    isError: overview.isError,
    refetch: () => {
      overview.refetch();
      users.refetch();
      plans.refetch();
      audit.refetch();
    },
    adjustCredits,
    updateUser,
    assignPlan,
    cancelPlan,
    createPlan,
    updatePlan,
    deletePlan,
    createBonusLink,
    updateBonusLink,
  };
}

/** One account, loaded only while its detail panel is open. */
export function useUserDetail(userId) {
  const query = useQuery({
    queryKey: adminKeys.user(userId),
    queryFn: () => adminApi.fetchUserDetail(userId),
    enabled: Boolean(userId),
  });

  return {
    detail: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
  };
}

export default useAdmin;
